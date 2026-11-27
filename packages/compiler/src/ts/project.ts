import { createHash } from "node:crypto";
import { posix } from "node:path";
import type { Diagnostic } from "@speeq/core/manifest";
import ts from "typescript";
import type { RepoFs } from "../fs/repo-fs.js";
import { ToolError } from "../tool-error.js";
import { parseSource } from "./parse.js";

const VIRTUAL = "/repo/";
/** One parsed repository file. `sf` is absent when the file could not be parsed. */
export interface ParsedFile {
  file: string;
  text: string;
  sf?: ts.SourceFile;
}
/** Files and resolutions that influenced one extraction, for incremental scanning. */
export interface Touched {
  files: Set<string>;
  resolutions: Map<string, string | null>;
}
/** Create an empty dependency tracker. */
export function newTouched(): Touched {
  return { files: new Set(), resolutions: new Map() };
}
/** Parses repository files on demand through the jailed filesystem and resolves imports by name only. */
export class SourceProject {
  readonly diagnostics: Diagnostic[] = [];
  parseCount = 0;
  readonly #fs: RepoFs;
  readonly #files: ReadonlySet<string>;
  readonly #dirs = new Set<string>();
  readonly #options: ts.CompilerOptions;
  readonly #text = new Map<string, Promise<string | undefined>>();
  readonly #parsed = new Map<string, Promise<ParsedFile | undefined>>();
  readonly #sha = new Map<string, Promise<string | undefined>>();
  readonly #resolved = new Map<string, string | null>();
  readonly #host: ts.ModuleResolutionHost;
  constructor(fs: RepoFs, files: readonly string[], options: ts.CompilerOptions = {}) {
    this.#fs = fs;
    this.#files = new Set(files);
    for (const f of files) {
      let dir = posix.dirname(f);
      while (dir !== "." && !this.#dirs.has(dir)) {
        this.#dirs.add(dir);
        dir = posix.dirname(dir);
      }
    }
    this.#options = {
      ...options,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      allowJs: true,
      resolveJsonModule: true,
    };
    this.#host = {
      fileExists: (n) => n.startsWith(VIRTUAL) && this.#files.has(n.slice(VIRTUAL.length)),
      directoryExists: (n) =>
        n === "/repo" || (n.startsWith(VIRTUAL) && this.#dirs.has(n.slice(VIRTUAL.length))),
      readFile: () => undefined,
      realpath: (n) => n,
      getCurrentDirectory: () => "/repo",
    };
  }
  has(file: string) {
    return this.#files.has(file);
  }
  /** Read a file once. Unreadable, oversized and denied files return undefined. */
  text(file: string): Promise<string | undefined> {
    let entry = this.#text.get(file);
    if (!entry) {
      entry = this.#fs.readText(file).catch((e: unknown) => {
        if (e instanceof ToolError && e.code === "SQ0006") throw e;
        return undefined;
      });
      this.#text.set(file, entry);
    }
    return entry;
  }
  /** SHA-256 of a file's content, or undefined when it cannot be read. */
  sha(file: string): Promise<string | undefined> {
    let entry = this.#sha.get(file);
    if (!entry) {
      entry = this.text(file).then((t) =>
        t === undefined ? undefined : createHash("sha256").update(t).digest("hex"),
      );
      this.#sha.set(file, entry);
    }
    return entry;
  }
  /** Parse a file once. Unparseable files are reported and return a file without `sf`. */
  source(file: string): Promise<ParsedFile | undefined> {
    let entry = this.#parsed.get(file);
    if (!entry) {
      entry = (async () => {
        const text = await this.text(file);
        if (text === undefined) return undefined;
        this.parseCount++;
        const sf = parseSource(file, text);
        return { file, text, sf };
      })();
      this.#parsed.set(file, entry);
    }
    return entry;
  }
  /** Resolve a module specifier to a repository file, or null for packages and unknown targets. */
  resolve(from: string, specifier: string, touched?: Touched): string | null {
    const key = `${from}\0${specifier}`;
    let target = this.#resolved.get(key);
    if (target === undefined) {
      const result = ts.resolveModuleName(specifier, VIRTUAL + from, this.#options, this.#host);
      const name = result.resolvedModule?.resolvedFileName;
      target = null;
      if (name?.startsWith(VIRTUAL)) {
        const rel = name.slice(VIRTUAL.length);
        if (this.#files.has(rel) && !/\.d\.[cm]?ts$/.test(rel)) target = rel;
      }
      this.#resolved.set(key, target);
    }
    touched?.resolutions.set(key, target);
    return target;
  }
}

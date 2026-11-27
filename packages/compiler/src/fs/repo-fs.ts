import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import type { Diagnostic } from "@speeq/core/manifest";
import ignore from "ignore";
import { type DiagnosticCode, diagnostics as registry } from "../diagnostics.js";
import { ToolError } from "../tool-error.js";
import { excluded } from "./deny.js";
/** Limits for untrusted repository inventory. */
export interface RepoFsOptions {
  root: string;
  maxFileBytes?: number;
  maxFiles?: number;
  extraIgnore?: string[];
  signal?: AbortSignal;
}
/** Read-only source access. */
export interface RepoFs {
  readonly root: string;
  listFiles(): Promise<readonly string[]>;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  readonly diagnostics: readonly Diagnostic[];
}
type Layer = { dir: string; rules: ReturnType<typeof ignore> };
/** Open a jailed source inventory. Ignore files are read through the same bounded file reader. */
export async function openRepoFs(options: RepoFsOptions): Promise<RepoFs> {
  const root = await realpath(options.root);
  const max = options.maxFileBytes ?? 1048576,
    cap = options.maxFiles ?? 20000;
  if (!Number.isSafeInteger(max) || max < 0 || !Number.isSafeInteger(cap) || cap < 0)
    throw new RangeError("Invalid scan limits");
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  function report(code: DiagnosticCode, file?: string) {
    const key = `${code}:${file}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push({
      code,
      message: registry[code].meaning,
      severity: registry[code].severity,
      ...(file ? { file } : {}),
    });
  }
  function deadline() {
    if (options.signal?.aborted) {
      report("SQ0006");
      throw new ToolError("SQ0006");
    }
  }
  function normalize(raw: string) {
    const path = raw.replaceAll("\\", "/");
    if (
      path
        .split("/")
        .some(
          (p) =>
            !p ||
            p === "." ||
            p === ".." ||
            /[<>:"|?*\p{Cc}]/u.test(p) ||
            /[. ]$/.test(p) ||
            /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p),
        )
    )
      throw new ToolError("SQ0001");
    if (excluded(path)) throw new ToolError("SQ0002");
    return path;
  }
  async function checked(path: string) {
    deadline();
    let current = root;
    for (const part of path.split("/")) {
      current = join(current, part);
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        report("SQ0003", relative(root, current).replaceAll("\\", "/"));
        throw new ToolError("SQ0003");
      }
    }
    const actual = await realpath(current);
    const rel = relative(root, actual);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\"))
      throw new ToolError("SQ0001");
    if (excluded(rel.replaceAll("\\", "/"))) throw new ToolError("SQ0002");
    return current;
  }
  async function bounded(path: string) {
    const full = await checked(path);
    const initial = await lstat(full);
    if (!initial.isFile()) throw new ToolError("SQ0002");
    const handle = await open(
      full,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
    try {
      const info = await handle.stat();
      await checked(path);
      if (!info.isFile() || info.dev !== initial.dev || info.ino !== initial.ino)
        throw new ToolError("SQ0002");
      function tooBig(): never {
        report("SQ0004", path);
        throw new ToolError("SQ0004");
      }
      if (info.size > max) tooBig();
      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        deadline();
        const buf = Buffer.alloc(Math.min(65536, max - total + 1));
        const { bytesRead } = await handle.read(buf);
        if (!bytesRead) break;
        total += bytesRead;
        if (total > max) tooBig();
        chunks.push(buf.subarray(0, bytesRead));
      }
      deadline();
      return Buffer.concat(chunks).toString("utf8");
    } finally {
      await handle.close();
    }
  }
  const extras = ignore().add(options.extraIgnore ?? []);
  async function layer(dir: string) {
    const path = dir ? `${dir}/.gitignore` : ".gitignore";
    try {
      return { dir, rules: ignore().add(await bounded(path)) };
    } catch (e) {
      if (
        (e as NodeJS.ErrnoException).code === "ENOENT" ||
        (e instanceof ToolError && (e.code === "SQ0003" || e.code === "SQ0004"))
      )
        return;
      throw e;
    }
  }
  function hidden(path: string, layers: Layer[]) {
    if (extras.ignores(path)) return true;
    let hidden = false;
    for (const l of layers) {
      const test = l.rules.test(l.dir ? path.slice(l.dir.length + 1) : path);
      if (test.ignored) hidden = true;
      if (test.unignored) hidden = false;
    }
    return hidden;
  }
  async function readable(raw: string) {
    const path = normalize(raw);
    let dir = "";
    const layers: Layer[] = [];
    const parts = path.split("/");
    for (const [i, p] of parts.entries()) {
      const next = await layer(dir);
      if (next) layers.push(next);
      dir = dir ? `${dir}/${p}` : p;
      if (hidden(dir + (i < parts.length - 1 ? "/" : ""), layers)) throw new ToolError("SQ0002");
    }
    return path;
  }
  async function readText(raw: string) {
    try {
      return await bounded(await readable(raw));
    } catch (e) {
      if (e instanceof ToolError) throw e;
      throw new ToolError("SQ0002");
    }
  }
  async function listFiles() {
    deadline();
    const files: string[] = [];
    let count = 0;
    async function walk(dir: string, parents: Layer[]): Promise<boolean> {
      deadline();
      const full = dir ? await checked(dir) : root;
      const l = await layer(dir);
      const layers = l ? [...parents, l] : parents;
      const entries = await readdir(full, { withFileTypes: true });
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        deadline();
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (!entry.isDirectory() && ++count > cap) {
          report("SQ0005");
          return false;
        }
        try {
          normalize(path);
        } catch {
          continue;
        }
        if (entry.isSymbolicLink()) {
          report("SQ0003", path);
          continue;
        }
        if (hidden(path + (entry.isDirectory() ? "/" : ""), layers)) continue;
        if (entry.isDirectory()) {
          if (!(await walk(path, layers))) return false;
        } else if (entry.isFile()) {
          const stat = await lstat(await checked(path));
          if (stat.size > max) report("SQ0004", path);
          else files.push(path);
        }
      }
      return true;
    }
    try {
      await walk("", []);
      return files.sort();
    } catch (e) {
      if (e instanceof ToolError) throw e;
      throw new ToolError("SQ0002");
    }
  }
  return {
    root,
    diagnostics,
    listFiles,
    readText,
    async exists(raw) {
      try {
        const path = await readable(raw);
        const stat = await lstat(await checked(path));
        return stat.isFile() && stat.size <= max;
      } catch (e) {
        if (e instanceof ToolError && e.code === "SQ0006") throw e;
        return false;
      }
    },
  };
}

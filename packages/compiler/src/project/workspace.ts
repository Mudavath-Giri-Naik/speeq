import { matchesGlob, posix } from "node:path";
import type { Evidence } from "@speeq/core/manifest";
import type { RepoFs } from "../fs/repo-fs.js";
import { ToolError } from "../tool-error.js";
import { dependencyEvidence, integrations } from "./integrations.js";
import { language } from "./language.js";
import { type PackageManager, packageManager } from "./package-manager.js";
import { readConfig } from "./tsconfig.js";
/** A selectable Next application. */
export interface AppCandidate {
  dir: string;
  name?: string;
  nextVersion?: string;
  evidence: Evidence[];
}
/** Repo-relative project and compiler configuration. */
export interface ProjectInfo {
  packageManager: PackageManager;
  workspace: {
    kind: "none" | "pnpm" | "npm" | "yarn" | "turbo";
    root: string;
    apps: AppCandidate[];
  };
  app?: {
    dir: string;
    nextVersion?: string;
    routers: ("app" | "pages")[];
    appRouterDir?: string;
    pagesDir?: string;
    srcDir: boolean;
  };
  language: "typescript" | "javascript" | "mixed";
  tsconfig?: {
    path: string;
    baseUrl?: string;
    aliases: { pattern: string; targets: string[] }[];
    references?: string[];
  };
  typescriptVersionInRepo?: string;
}
interface PackageData {
  name?: string;
  packageManager?: string;
  workspaces?: string[] | { packages: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}
function yamlPackages(text: string) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((l) => /^packages:\s*(?:#.*)?$/.test(l));
  const patterns: string[] = [];
  if (index < 0) return patterns;
  for (const l of lines.slice(index + 1)) {
    if (/^\S/.test(l)) break;
    const m = /^\s*-\s*['"]?([^'"\s#]+)['"]?/.exec(l);
    if (m?.[1]) patterns.push(m[1]);
  }
  return patterns;
}
/** Identify workspaces and select an application without executing host configuration. */
export async function inspectProject(fs: RepoFs, files: readonly string[], appDir?: string) {
  if (
    appDir !== undefined &&
    appDir !== "." &&
    (!appDir ||
      /[:\\]/.test(appDir) ||
      appDir.split("/").some((s) => !s || s === ".." || s === "."))
  )
    throw new ToolError("SQ0001");
  const paths = new Set(files),
    configs = new Map<string, string>(),
    packages = new Map<string, string>(),
    manifests = new Map<string, PackageData>();
  for (const f of files.filter((f) => f.endsWith(".json"))) {
    if (f === "expected.json" || f.includes("/.speeq/")) continue;
    const text = await fs.readText(f);
    configs.set(f, text);
    if (posix.basename(f) === "package.json") {
      try {
        const pkg = JSON.parse(text);
        if (pkg && typeof pkg === "object") {
          manifests.set(posix.dirname(f), pkg);
          if (typeof pkg.name === "string") packages.set(pkg.name, posix.dirname(f));
        }
      } catch {
        /* Malformed package data cannot establish an application. */
      }
    }
  }
  const root = manifests.get(".") ?? {};
  const yaml = paths.has("pnpm-workspace.yaml");
  const raw = root.workspaces;
  const patterns = yaml
    ? yamlPackages(await fs.readText("pnpm-workspace.yaml"))
    : Array.isArray(raw)
      ? raw
      : (raw?.packages ?? []);
  const apps: AppCandidate[] = [];
  for (const [dir, p] of manifests) {
    if (
      dir !== "." &&
      (!patterns.some((g) => !g.startsWith("!") && matchesGlob(dir, g)) ||
        patterns.some((g) => g.startsWith("!") && matchesGlob(dir, g.slice(1))))
    )
      continue;
    const next = p.dependencies?.next ?? p.devDependencies?.next;
    if (typeof next !== "string") continue;
    const f = posix.join(dir, "package.json");
    apps.push({
      dir,
      name: p.name,
      nextVersion: next,
      evidence: [dependencyEvidence(f, configs.get(f) ?? "", "next")],
    });
  }
  const chosen =
    appDir === undefined
      ? apps.length === 1
        ? apps[0]
        : undefined
      : apps.find((a) => a.dir === appDir);
  const dir = chosen?.dir ?? ".",
    prefix = dir === "." ? "" : dir + "/",
    pkg = manifests.get(dir) ?? {},
    deps = { ...pkg.peerDependencies, ...pkg.devDependencies, ...pkg.dependencies };
  const pm = packageManager([pkg.packageManager, root.packageManager], paths, prefix);
  const project: ProjectInfo = {
    workspace: {
      kind: yaml
        ? "pnpm"
        : paths.has("turbo.json")
          ? "turbo"
          : raw
            ? pm === "yarn"
              ? "yarn"
              : "npm"
            : "none",
      apps,
      root: ".",
    },
    packageManager: pm,
    language: "javascript",
  };
  const appFiles = files.filter((f) => f.startsWith(prefix));
  const conf = ["tsconfig.json", "jsconfig.json"].map((n) => prefix + n).find((f) => paths.has(f));
  const config = conf ? readConfig(conf, configs, packages) : undefined;
  if (chosen) {
    const find = (name: string) =>
      [prefix + name, prefix + "src/" + name].find((d) =>
        appFiles.some((f) => f.startsWith(d + "/")),
      );
    const appRouterDir = find("app"),
      pagesDir = find("pages");
    project.app = {
      dir,
      nextVersion: chosen.nextVersion,
      appRouterDir,
      pagesDir,
      srcDir: !![appRouterDir, pagesDir].some((f) => f?.startsWith(prefix + "src/")),
      routers: [],
    };
    if (appRouterDir) project.app.routers.push("app");
    if (pagesDir) project.app.routers.push("pages");
    project.language = language(appFiles, paths.has(prefix + "tsconfig.json"));
    project.tsconfig = config && { ...config.info, references: config.references };
    project.typescriptVersionInRepo = deps.typescript ?? root.devDependencies?.typescript;
  }
  const packageFile = prefix + "package.json";
  return {
    project,
    chosen,
    apps,
    packages,
    config,
    invalidConfig: !config ? conf : undefined,
    appFiles,
    prefix,
    integrations: integrations(deps, packageFile, configs.get(packageFile) ?? ""),
  };
}

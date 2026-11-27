import type { RouteCapability } from "@speeq/core/manifest";
import type { DiagnosticCode } from "../diagnostics.js";

/** Router directories relative to the repository root. */
export interface RouterDirs {
  appRouterDir?: string;
  pagesDir?: string;
}
/** How a file takes part in routing. */
export type Role =
  | {
      role: "page";
      router: "app" | "pages";
      path: string;
      pattern: string;
      dynamic: RouteCapability["dynamic"];
      params: string[];
    }
  | { role: "route-handler"; router: "app"; path: string }
  | { role: "api"; router: "pages"; path: string }
  | { role: "skip"; diag?: DiagnosticCode };

const SOURCE = /\.(tsx|ts|jsx|js)$/;
const dynamicRank = ["static", "dynamic", "catch-all", "optional-catch-all"] as const;
/** Recognise a dynamic segment: `[x]`, `[...x]` or `[[...x]]`. */
function dynamicPart(part: string) {
  const opt = /^\[\[\.\.\.([A-Za-z0-9_-]+)\]\]$/.exec(part);
  if (opt) return { rank: 3, name: opt[1] as string, pattern: `:${opt[1]}*?` };
  const rest = /^\[\.\.\.([A-Za-z0-9_-]+)\]$/.exec(part);
  if (rest) return { rank: 2, name: rest[1] as string, pattern: `:${rest[1]}*` };
  const one = /^\[([A-Za-z0-9_-]+)\]$/.exec(part);
  if (one) return { rank: 1, name: one[1] as string, pattern: `:${one[1]}` };
  return undefined;
}
/** Convert directory parts into a framework path. `undefined` reports a skipped route. */
function segments(
  parts: readonly string[],
  router: "app" | "pages",
):
  | { path: string; pattern: string; dynamic: RouteCapability["dynamic"]; params: string[] }
  | { skip: DiagnosticCode | undefined } {
  const out: string[] = [],
    pattern: string[] = [],
    params: string[] = [];
  let rank = 0;
  for (const part of parts) {
    if (router === "app") {
      if (part.startsWith("_")) return { skip: undefined };
      if (part.startsWith("@")) return { skip: "SQ0140" };
      if (/^\((?:\.{1,3}|\.\.\)\(\.\.)\)/.test(part)) return { skip: "SQ0141" };
      if (/^\([^)]*\)$/.test(part)) continue;
    }
    const dyn = dynamicPart(part);
    if (dyn) {
      rank = Math.max(rank, dyn.rank);
      params.push(dyn.name);
      pattern.push(dyn.pattern);
    } else pattern.push(part);
    out.push(part);
  }
  return {
    path: `/${out.join("/")}`,
    pattern: `/${pattern.join("/")}`,
    dynamic: dynamicRank[rank] ?? "static",
    params,
  };
}
/** Decide what routing role a repository file has. Returns `undefined` for non-routing files. */
export function classify(file: string, dirs: RouterDirs): Role | undefined {
  const app = dirs.appRouterDir,
    pages = dirs.pagesDir;
  if (app && file.startsWith(`${app}/`) && SOURCE.test(file) && !/\.d\.ts$/.test(file)) {
    const rel = file.slice(app.length + 1).split("/");
    const name = (rel.pop() ?? "").replace(SOURCE, "");
    if (name !== "page" && name !== "route") return undefined;
    const s = segments(rel, "app");
    if ("skip" in s) return { role: "skip", diag: s.skip };
    return name === "page"
      ? { role: "page", router: "app", ...s }
      : { role: "route-handler", router: "app", path: s.path };
  }
  if (pages && file.startsWith(`${pages}/`) && SOURCE.test(file) && !/\.d\.ts$/.test(file)) {
    if (/\.(test|spec)\./.test(file)) return undefined;
    const rel = file.slice(pages.length + 1).split("/");
    const name = (rel.pop() ?? "").replace(SOURCE, "");
    if (!rel.length && ["_app", "_document", "_error", "404", "500"].includes(name))
      return undefined;
    if (name.startsWith("_") && !rel.length) return undefined;
    const parts = name === "index" ? rel : [...rel, name];
    const s = segments(parts, "pages");
    if ("skip" in s) return undefined;
    return parts[0] === "api"
      ? { role: "api", router: "pages", path: s.path }
      : { role: "page", router: "pages", ...s };
  }
  return undefined;
}
/** Title-case the last static path segment, or "Home" for the root. */
export function titleFromPath(path: string) {
  const last = path
    .split("/")
    .filter((s) => s && !s.startsWith("["))
    .pop();
  if (!last) return path === "/" ? "Home" : "Page";
  return last
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 80);
}

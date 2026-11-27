/** `true`/`false` when every pattern could be interpreted, otherwise `"unknown"`. */
export type MatchResult = boolean | "unknown";

const literal = /^[A-Za-z0-9._~%@-]+$/;
const param = /^:[A-Za-z_][A-Za-z0-9_]*([*+?]?)$/;
/**
 * Compile the simple subset of Next.js matchers: literal prefixes, `:name`, `:name*`, `:name+`,
 * `:name?` and `(.*)`. Look-ahead and other regular-expression syntax is not interpreted.
 */
export function compileMatcher(pattern: string): RegExp | undefined {
  if (!pattern.startsWith("/")) return;
  if (pattern === "/") return /^\/?$/;
  let source = "";
  for (const seg of pattern.slice(1).split("/")) {
    if (!seg) return;
    if (seg === "(.*)") {
      source += "(?:/.*)?";
      continue;
    }
    const p = param.exec(seg);
    if (p) {
      source +=
        p[1] === "*"
          ? "(?:/[^/]+)*"
          : p[1] === "+"
            ? "(?:/[^/]+)+"
            : p[1] === "?"
              ? "(?:/[^/]+)?"
              : "/[^/]+";
      continue;
    }
    if (!literal.test(seg)) return;
    source += `/${seg.replace(/[.]/g, "\\.")}`;
  }
  return new RegExp(`^${source}/?$`);
}
/** Concrete URLs a framework route template can produce, for matcher tests. */
export function samples(routePath: string): string[] {
  let out = [""];
  for (const seg of routePath.split("/").filter(Boolean)) {
    if (/^\[\[\.\.\.\w+\]\]$/.test(seg)) out = [...out, ...out.map((o) => `${o}/x`)];
    else if (/^\[\.\.\.\w+\]$/.test(seg)) out = out.map((o) => `${o}/x/y`);
    else if (/^\[[^\]]+\]$/.test(seg)) out = out.map((o) => `${o}/x`);
    else out = out.map((o) => `${o}/${seg}`);
  }
  return out.map((o) => o || "/");
}
/** Does any pattern cover the route? Uninterpretable patterns make the answer unknown unless one matches. */
export function matchesRoute(patterns: readonly string[], routePath: string): MatchResult {
  const urls = samples(routePath);
  let unknown = false;
  for (const p of patterns) {
    const re = compileMatcher(p);
    if (!re) unknown = true;
    else if (urls.some((u) => re.test(u))) return true;
  }
  return unknown ? "unknown" : false;
}

import type { AuthObservation, Evidence } from "@speeq/core/manifest";
import ts from "typescript";
import { lineOf, nodes } from "../ts/parse.js";
import { matchesRoute } from "./matcher.js";
import { keyName, property, stringValue, unwrap } from "./metadata.js";

const AUTH_NAMES = new Set([
  "auth",
  "getServerSession",
  "getSession",
  "getToken",
  "currentUser",
  "clerkClient",
  "getUser",
  "requireUser",
  "requireAuth",
  "withAuth",
  "clerkMiddleware",
  "authMiddleware",
  "getKindeServerSession",
]);
/** A call to a well-known authentication helper. Evidence only, never proof of protection. */
export interface AuthCall {
  line: number;
  name: string;
}
function dotted(e: ts.Expression): string | undefined {
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) {
    const base = dotted(e.expression);
    return base ? `${base}.${e.name.text}` : undefined;
  }
  return undefined;
}
/** Find calls to the fixed list of authentication helpers in one file. */
export function authCalls(sf: ts.SourceFile): AuthCall[] {
  const out: AuthCall[] = [];
  for (const n of nodes(sf)) {
    if (!ts.isCallExpression(n)) continue;
    const name = dotted(n.expression);
    if (!name) continue;
    const last = name.slice(name.lastIndexOf(".") + 1);
    if (AUTH_NAMES.has(last) || name.endsWith("auth.protect"))
      out.push({ line: lineOf(n), name: last });
  }
  return out.sort((a, b) => a.line - b.line);
}
/** What one middleware or proxy file says about the paths it runs on and the auth it calls. */
export interface Middleware {
  file: string;
  /** Absent means the file runs on every path. */
  matchers?: string[];
  /** True when a matcher exists but is not made of string literals. */
  matcherDynamic: boolean;
  calls: AuthCall[];
}
/** Read `config.matcher` literally and list auth calls. Never executes the file. */
export function readMiddleware(file: string, sf: ts.SourceFile): Middleware {
  const result: Middleware = { file, matcherDynamic: false, calls: authCalls(sf) };
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== "config" || !d.initializer) continue;
      const init = unwrap(d.initializer);
      if (!ts.isObjectLiteralExpression(init)) {
        result.matcherDynamic = true;
        continue;
      }
      const m = property(init, "matcher");
      if (!m) {
        if (init.properties.some((p) => !ts.isPropertyAssignment(p) || !keyName(p.name)))
          result.matcherDynamic = true;
        continue;
      }
      const list: string[] = [];
      const single = stringValue(m);
      if (single !== undefined) list.push(single);
      else if (ts.isArrayLiteralExpression(m)) {
        for (const el of m.elements) {
          const s = stringValue(el);
          if (s !== undefined) list.push(s);
          else if (ts.isObjectLiteralExpression(el)) {
            const src = stringValue(property(el, "source"));
            if (src === undefined) result.matcherDynamic = true;
            else list.push(src);
          } else result.matcherDynamic = true;
        }
      } else result.matcherDynamic = true;
      result.matchers = list;
    }
  }
  return result;
}
const note = "Observed, not verified";
/**
 * Combine the defining file's own auth calls with middleware coverage of `routePath`. `present` is
 * evidence that an auth helper is called, never proof that access is enforced.
 */
export function observeAuth(
  file: string,
  own: readonly AuthCall[],
  middleware: readonly Middleware[],
  routePath?: string,
): AuthObservation {
  const evidence: Evidence[] = own.slice(0, 3).map((c) => ({
    detector: "auth-call",
    file,
    line: c.line,
    note: `${c.name} call. ${note}`,
  }));
  let unknown = false;
  for (const mw of middleware) {
    if (mw.matcherDynamic) {
      unknown = true;
      continue;
    }
    let covered: boolean | "unknown" = true;
    if (mw.matchers && routePath !== undefined) covered = matchesRoute(mw.matchers, routePath);
    else if (mw.matchers) covered = "unknown";
    if (covered === "unknown") unknown = true;
    const first = mw.calls[0];
    if (covered === true && first)
      evidence.push({
        detector: "auth-middleware",
        file: mw.file,
        line: first.line,
        note: `${first.name} call in middleware. ${note}`,
      });
  }
  if (evidence.length) return { observed: "present", evidence };
  return { observed: unknown ? "unknown" : "none-found", evidence: [] };
}

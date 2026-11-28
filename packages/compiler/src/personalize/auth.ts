import type { Evidence } from "@speeq/core/manifest";
import ts from "typescript";
import type { Middleware } from "../nextjs/auth.js";
import { keyName, unwrap } from "../nextjs/metadata.js";
import type { DetectedIntegration } from "../project/integrations.js";
import { lineOf, nodes } from "../ts/parse.js";

/** Authentication systems SPEEQ knows. */
export type AuthProviderId =
  | "authjs"
  | "nextauth-v4"
  | "supabase"
  | "clerk"
  | "better-auth"
  | "firebase"
  | "kinde"
  | "custom";

/**
 * How far discovery got. `implementation-detected` means SPEEQ found the server-side code it needs
 * and can generate a `resolveUser`; it is evidence from the source, not proof that sign-in works.
 * `generated` and `verified` are added later by the integration engine and the verify step.
 */
export type AuthLevel =
  | "provider-detected"
  | "implementation-detected"
  | "requires-review"
  | "unsupported";

/** The server entry point a generated `resolveUser` calls. */
export type AuthEntry =
  | { kind: "authjs"; file: string; exportName: string }
  | { kind: "nextauth-v4"; file: string; exportName: string }
  | { kind: "supabase"; file: string; exportName: string }
  | { kind: "better-auth"; file: string; exportName: string }
  | { kind: "clerk" };

/** One authentication system found in the app. */
export interface AuthCandidate {
  provider: AuthProviderId;
  label: string;
  level: AuthLevel;
  /** Present only for `implementation-detected`. */
  entry?: AuthEntry;
  /** Profile fields the provider's session usually carries. */
  profileFields: ("displayName" | "locale")[];
  /** Whether the provider has organisations or tenants SPEEQ can read. */
  tenants: boolean;
  evidence: Evidence[];
  /** What the developer should know or do, in plain words. */
  notes: string[];
}

/** What discovery found about sign-in. */
export interface AuthDiscovery {
  candidates: AuthCandidate[];
  /** Index into `candidates` of the one to bind, when exactly one is ready. */
  recommended?: number;
  /** Routes that look like sign-in pages, e.g. `/login`. */
  loginRoutes: string[];
}

interface ParsedSource {
  file: string;
  text: string;
  sf?: ts.SourceFile;
}

const LABELS: Record<AuthProviderId, string> = {
  authjs: "Auth.js (NextAuth v5)",
  "nextauth-v4": "NextAuth v4",
  supabase: "Supabase Auth",
  clerk: "Clerk",
  "better-auth": "Better Auth",
  firebase: "Firebase Auth",
  kinde: "Kinde",
  custom: "Your own sign-in code",
};
const CUSTOM_NAMES =
  /^(getCurrentUser|getSessionUser|currentUser|getUser|getAuthUser|requireUser|getViewer|getMe)$/;
const ROUTE_FILE = /(?:^|\/)route\.[cm]?[jt]sx?$/;
const LOGIN = /^\/(?:auth\/)?(?:login|log-in|signin|sign-in)(?:\/|$)/;

function exported(st: ts.Statement): boolean {
  return (
    !!ts.canHaveModifiers(st) &&
    !!ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}
function callee(e: ts.Expression): string | undefined {
  const x = unwrap(e);
  if (!ts.isCallExpression(x)) return undefined;
  const c = x.expression;
  if (ts.isIdentifier(c)) return c.text;
  if (ts.isPropertyAccessExpression(c)) return c.name.text;
  return undefined;
}
function importsFrom(sf: ts.SourceFile, mod: RegExp): boolean {
  return sf.statements.some(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      mod.test(s.moduleSpecifier.text),
  );
}
function ev(file: string, line: number, detector: string, note: string): Evidence {
  return { file, line, detector, note: note.slice(0, 200) };
}
function bodyCalls(node: ts.Node, name: string): boolean {
  for (const n of nodes(node)) if (ts.isCallExpression(n) && callee(n) === name) return true;
  return false;
}

/** Exported names and their declarations, for the patterns below. */
function exportedDecls(sf: ts.SourceFile) {
  const out: {
    name: string;
    node: ts.Node;
    init?: ts.Expression;
    type?: string;
    destructured?: string[];
  }[] = [];
  for (const st of sf.statements) {
    if (!exported(st)) continue;
    if (ts.isFunctionDeclaration(st) && st.name) out.push({ name: st.name.text, node: st });
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isObjectBindingPattern(d.name) && d.initializer) {
        const names = d.name.elements.flatMap((el) => {
          const prop = el.propertyName ? keyName(el.propertyName) : undefined;
          return ts.isIdentifier(el.name) ? [prop ?? el.name.text] : [];
        });
        out.push({ name: "", node: d, init: d.initializer, destructured: names });
      } else if (ts.isIdentifier(d.name)) {
        const type =
          d.type && ts.isTypeReferenceNode(d.type) && ts.isIdentifier(d.type.typeName)
            ? d.type.typeName.text
            : undefined;
        out.push({
          name: d.name.text,
          node: d,
          ...(d.initializer ? { init: d.initializer } : {}),
          ...(type ? { type } : {}),
        });
      }
    }
  }
  return out;
}

function has(ints: readonly DetectedIntegration[], id: string) {
  return ints.find((i) => i.id === id);
}
function major(range: string | undefined): number | undefined {
  const m = /(\d+)/.exec(range ?? "");
  return m ? Number(m[1]) : undefined;
}

/**
 * Finds the app's sign-in system from source evidence. Reads code as data and never runs it. A
 * package alone is only `provider-detected`; a binding is offered only when the server-side entry
 * point (the `auth()` export, `authOptions`, the Supabase server client, `betterAuth`) is found.
 */
export function discoverAuth(input: {
  sources: readonly ParsedSource[];
  integrations: readonly DetectedIntegration[];
  middleware: readonly Middleware[];
  routes: readonly string[];
}): AuthDiscovery {
  const found = new Map<AuthProviderId, AuthCandidate>();
  const add = (c: AuthCandidate) => {
    const prev = found.get(c.provider);
    const rank = (l: AuthLevel) =>
      ["implementation-detected", "requires-review", "provider-detected", "unsupported"].indexOf(l);
    if (!prev || rank(c.level) < rank(prev.level)) found.set(c.provider, c);
    else prev.evidence.push(...c.evidence.slice(0, 2));
  };
  const base = (provider: AuthProviderId, level: AuthLevel): AuthCandidate => ({
    provider,
    label: LABELS[provider],
    level,
    profileFields: provider === "clerk" || provider === "custom" ? [] : ["displayName"],
    tenants: provider === "clerk",
    evidence: [],
    notes: [],
  });
  const custom: Evidence[] = [];

  for (const src of input.sources) {
    const sf = src.sf;
    if (!sf) continue;
    for (const d of exportedDecls(sf)) {
      const line = lineOf(d.node);
      // Auth.js v5: export const { auth, handlers, ... } = NextAuth({...})
      if (
        d.destructured &&
        d.init &&
        callee(d.init) === "NextAuth" &&
        d.destructured.includes("auth")
      ) {
        add({
          ...base("authjs", "implementation-detected"),
          entry: { kind: "authjs", file: src.file, exportName: "auth" },
          evidence: [ev(src.file, line, "authjs-export", "exports auth from NextAuth()")],
        });
        continue;
      }
      // NextAuth v4: export const authOptions: NextAuthOptions = {...}
      if (
        d.name &&
        (d.type === "NextAuthOptions" || d.type === "AuthOptions" || d.name === "authOptions") &&
        d.init &&
        ts.isObjectLiteralExpression(unwrap(d.init))
      ) {
        const inRoute = ROUTE_FILE.test(src.file);
        add({
          ...base("nextauth-v4", inRoute ? "requires-review" : "implementation-detected"),
          ...(inRoute
            ? {}
            : { entry: { kind: "nextauth-v4", file: src.file, exportName: d.name } }),
          evidence: [ev(src.file, line, "nextauth-options", `exports ${d.name}`)],
          notes: inRoute
            ? [
                "authOptions is exported from a route file. Move it to lib/auth.ts so speeq can import it.",
              ]
            : [],
        });
        continue;
      }
      // Better Auth: export const auth = betterAuth({...})
      if (d.name && d.init && callee(d.init) === "betterAuth") {
        add({
          ...base("better-auth", "implementation-detected"),
          entry: { kind: "better-auth", file: src.file, exportName: d.name },
          evidence: [
            ev(src.file, line, "better-auth-export", `exports ${d.name} from betterAuth()`),
          ],
        });
        continue;
      }
      // Supabase SSR: export async function createClient() { ... createServerClient(...) }
      if (
        d.name &&
        importsFrom(sf, /^@supabase\/ssr$/) &&
        bodyCalls(d.node, "createServerClient")
      ) {
        add({
          ...base("supabase", "implementation-detected"),
          entry: { kind: "supabase", file: src.file, exportName: d.name },
          evidence: [
            ev(src.file, line, "supabase-server-client", `${d.name} creates a server client`),
          ],
        });
        continue;
      }
      if (d.name && CUSTOM_NAMES.test(d.name) && !ROUTE_FILE.test(src.file))
        custom.push(ev(src.file, line, "custom-user-function", `exports ${d.name}`));
    }
  }

  const ints = input.integrations;
  const nextAuth = has(ints, "nextauth");
  if (nextAuth && !found.has("authjs") && !found.has("nextauth-v4")) {
    const v5 = (major(nextAuth.versionRange) ?? 0) >= 5 || /beta/.test(nextAuth.versionRange);
    add({
      ...base(v5 ? "authjs" : "nextauth-v4", "provider-detected"),
      evidence: nextAuth.evidence,
      notes: [
        v5
          ? "next-auth is installed but no `export const { auth } = NextAuth(...)` was found."
          : "next-auth is installed but no exported authOptions was found.",
      ],
    });
  }
  if (has(ints, "authjs") && !found.has("authjs") && !nextAuth)
    add({ ...base("authjs", "provider-detected"), evidence: has(ints, "authjs")?.evidence ?? [] });
  const supa = has(ints, "supabase-auth") ?? has(ints, "supabase");
  if (supa && !found.has("supabase"))
    add({
      ...base("supabase", "provider-detected"),
      evidence: supa.evidence,
      notes: [
        "No server client using @supabase/ssr was found. Add utils/supabase/server.ts as in the Supabase Next.js guide.",
      ],
    });
  const clerk = has(ints, "clerk");
  if (clerk) {
    const mw = input.middleware.find((m) =>
      m.calls.some((c) => c.name === "clerkMiddleware" || c.name === "authMiddleware"),
    );
    const call = mw?.calls.find((c) => c.name === "clerkMiddleware" || c.name === "authMiddleware");
    add(
      mw && call
        ? {
            ...base("clerk", "implementation-detected"),
            entry: { kind: "clerk" },
            evidence: [
              ev(mw.file, call.line, "clerk-middleware", `${call.name} in middleware`),
              ...clerk.evidence,
            ],
          }
        : {
            ...base("clerk", "provider-detected"),
            evidence: clerk.evidence,
            notes: [
              "Clerk's server auth() needs clerkMiddleware() in middleware.ts. Add it, then run setup again.",
            ],
          },
    );
  }
  if (has(ints, "better-auth") && !found.has("better-auth"))
    add({
      ...base("better-auth", "provider-detected"),
      evidence: has(ints, "better-auth")?.evidence ?? [],
      notes: ["better-auth is installed but no exported betterAuth() instance was found."],
    });
  const fb = has(ints, "firebase");
  if (fb)
    add({
      ...base("firebase", "unsupported"),
      evidence: fb.evidence,
      notes: [
        "Firebase Auth has no standard server session in Next.js. Write resolveUser yourself: verify the session cookie or ID token with firebase-admin.",
      ],
    });
  const kinde = has(ints, "kinde");
  if (kinde)
    add({
      ...base("kinde", "requires-review"),
      evidence: kinde.evidence,
      notes: [
        "Kinde is not bound automatically yet. Use getKindeServerSession().getUser() in resolveUser.",
      ],
    });
  if (custom.length && found.size === 0)
    add({
      ...base("custom", "requires-review"),
      evidence: custom.slice(0, 3),
      notes: [
        "These look like your own user helpers. Review the suggested resolveUser and return { id } from your session.",
      ],
    });

  const order: AuthLevel[] = [
    "implementation-detected",
    "requires-review",
    "provider-detected",
    "unsupported",
  ];
  const candidates = [...found.values()]
    .map((c) => ({ ...c, evidence: c.evidence.slice(0, 4) }))
    .sort(
      (a, b) =>
        order.indexOf(a.level) - order.indexOf(b.level) || a.provider.localeCompare(b.provider),
    );
  const ready = candidates.filter((c) => c.level === "implementation-detected");
  return {
    candidates,
    ...(ready.length === 1 ? { recommended: candidates.indexOf(ready[0] as AuthCandidate) } : {}),
    loginRoutes: input.routes.filter((r) => LOGIN.test(r)).slice(0, 5),
  };
}

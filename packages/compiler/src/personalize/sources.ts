import type { EndpointCapability, Evidence, Manifest } from "@speeq/core/manifest";
import ts from "typescript";
import { keyName, unwrap } from "../nextjs/metadata.js";
import { isSensitiveName } from "../schema/sensitive-names.js";
import { nodes } from "../ts/parse.js";

/** Context categories, the same list as `CONTEXT_CATEGORIES` in `@speeq/server`. */
export type SourceCategory =
  | "identity"
  | "ownership"
  | "activity"
  | "commerce"
  | "learning"
  | "application"
  | "custom";

/**
 * A place in the app that could tell the agent about the signed-in customer. Discovery only
 * suggests: every candidate starts unapproved, and nothing is bound until the developer approves it
 * and its fields.
 */
export interface DataSourceCandidate {
  /** Suggested context source id, `[a-z][a-z0-9_]{0,40}`. */
  id: string;
  title: string;
  /** Manifest capability this comes from. */
  capabilityId: string;
  type: "endpoint";
  method: "GET";
  path: string;
  location: { file: string; line: number };
  category: SourceCategory;
  /** Why this category, e.g. `path /api/cart`. */
  because: string;
  /** Top-level response fields read from literal `json({...})` calls; empty when unknown. */
  fields: { name: string; sensitive: boolean }[];
  /** Required inputs (path or query). A source with any cannot be bound without code. */
  requiredInputs: string[];
  /**
   * `helper-called`: the handler or middleware calls a known auth helper. `none-found` and `unknown`
   * mean the endpoint may not check who is asking: never bind it without review.
   */
  authEvidence: "helper-called" | "none-found" | "unknown";
  /** `user-referenced`: the handler mentions the session user. Evidence only, not proof of scoping. */
  customerScope: "user-referenced" | "not-found";
  /** `bindable`: a GET with no required inputs, called with the visitor's cookies. */
  binding: "bindable" | "requires-binding";
  evidence: Evidence[];
}

const SIGNALS: { category: SourceCategory; words: string[] }[] = [
  { category: "identity", words: ["me", "profile", "account", "user", "whoami", "session-user"] },
  {
    category: "commerce",
    words: ["cart", "basket", "orders", "order", "wishlist", "saved", "checkout"],
  },
  {
    category: "ownership",
    words: [
      "subscriptions",
      "subscription",
      "licenses",
      "memberships",
      "membership",
      "purchases",
      "entitlements",
      "enrollments",
      "enrolled",
      "library",
      "my-courses",
    ],
  },
  {
    category: "learning",
    words: ["progress", "lessons", "completed", "attempts", "practice", "streak"],
  },
  {
    category: "activity",
    words: [
      "recent",
      "history",
      "searches",
      "recent-searches",
      "recently-viewed",
      "bookmarks",
      "activity",
      "notifications",
    ],
  },
];
const SKIP = /^\/api\/(?:auth|speeq|webhooks?|cron|health)(?:\/|$)/;
const USER_REF =
  /\b(?:session\??\.user|user\??\.id|userId|currentUser\s*\(|getUser\s*\(|auth\s*\(\s*\))/;

function words(path: string): string[] {
  return path
    .toLowerCase()
    .split("/")
    .filter((s) => s && !s.startsWith(":") && !s.startsWith("[") && s !== "api");
}
function categorize(path: string): { category: SourceCategory; because: string } | undefined {
  const segs = words(path);
  for (const s of SIGNALS) {
    const hit = segs.find(
      (w) => s.words.includes(w) || s.words.some((x) => w.split(/[-_]/).includes(x)),
    );
    if (hit) return { category: s.category, because: `path ${path}` };
  }
  return undefined;
}
/** True when an endpoint path could hold customer data (cheap filter before parsing). */
export function isCandidatePath(path: string): boolean {
  return !SKIP.test(path) && categorize(path) !== undefined;
}
function idFor(path: string, taken: Set<string>): string {
  const last = words(path).at(-1) ?? "source";
  let id = last.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "source";
  if (!/^[a-z]/.test(id)) id = `s_${id}`;
  id = id.slice(0, 36);
  let out = id;
  for (let n = 2; taken.has(out); n++) out = `${id}_${n}`;
  taken.add(out);
  return out;
}

/** Object literal keys passed to `json(...)` inside the GET handler (or the whole file). */
function responseFields(sf: ts.SourceFile): string[] {
  let scope: ts.Node = sf;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === "GET") scope = st;
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        if (ts.isIdentifier(d.name) && d.name.text === "GET" && d.initializer)
          scope = d.initializer;
  }
  const keys = new Set<string>();
  for (const n of nodes(scope)) {
    if (!ts.isCallExpression(n)) continue;
    const c = n.expression;
    if (!ts.isPropertyAccessExpression(c) || c.name.text !== "json") continue;
    const arg = n.arguments[0] ? unwrap(n.arguments[0]) : undefined;
    if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
    for (const p of arg.properties) {
      if (ts.isShorthandPropertyAssignment(p)) keys.add(p.name.text);
      else if (ts.isPropertyAssignment(p)) {
        const k = keyName(p.name);
        if (k) keys.add(k);
      }
    }
  }
  return [...keys].filter((k) => k !== "error").slice(0, 30);
}

/**
 * Suggests customer data sources from the GET endpoints in the manifest. Uses paths, literal
 * response shapes and auth evidence only. Never treats a name as proof that an endpoint is safe.
 */
export function discoverDataSources(
  manifest: Manifest,
  parsed: ReadonlyMap<string, ts.SourceFile | undefined>,
): DataSourceCandidate[] {
  const taken = new Set<string>();
  const out: DataSourceCandidate[] = [];
  const endpoints = manifest.capabilities.filter(
    (c): c is EndpointCapability => c.kind === "endpoint" && c.methods.includes("GET"),
  );
  for (const e of endpoints.sort((a, b) => a.path.localeCompare(b.path))) {
    if (SKIP.test(e.path)) continue;
    const cat = categorize(e.path);
    if (!cat) continue;
    const sf = parsed.get(e.source.file);
    const required = [
      ...e.path.split("/").flatMap((s) => {
        const m = /^(?::(\w+)|\[{1,2}(?:\.\.\.)?(\w+)\]{1,2})$/.exec(s);
        return m ? [m[1] ?? m[2] ?? s] : [];
      }),
      ...(e.input?.query?.required ?? []),
    ];
    const authEvidence =
      e.auth.observed === "present"
        ? "helper-called"
        : e.auth.observed === "unknown"
          ? "unknown"
          : "none-found";
    out.push({
      id: idFor(e.path, taken),
      title: e.title,
      capabilityId: e.id,
      type: "endpoint",
      method: "GET",
      path: e.path,
      location: { file: e.source.file, line: e.source.line },
      ...cat,
      fields: (sf ? responseFields(sf) : []).map((name) => ({
        name,
        sensitive: isSensitiveName(name),
      })),
      requiredInputs: required,
      authEvidence,
      customerScope: sf && USER_REF.test(sf.getFullText()) ? "user-referenced" : "not-found",
      binding: required.length === 0 ? "bindable" : "requires-binding",
      evidence: [...e.evidence.slice(0, 1), ...e.auth.evidence.slice(0, 2)],
    });
    if (out.length === 40) break;
  }
  return out;
}

import type { AuthEntry } from "@speeq/compiler";
import { seal } from "./owned.js";
import { imp, importPath } from "./render.js";

/*
 * Agent settings managed by `speeq setup` (ADR-0024 decisions 1 to 3). Choices live in
 * `.speeq/setup.json` (no secrets, no values); they are rendered into one CLI-owned, server-only
 * module `<generatedDir>/agent.ts` that `speeq.config.ts` spreads into `createSpeeq({ ... })`.
 */

/** How the agent sounds. Mirrors `AgentStyle` in `@speeq/server`. */
export interface StyleChoice {
  personality?:
    | "professional"
    | "friendly"
    | "conversational"
    | "educational"
    | "concise"
    | "formal"
    | "custom";
  responseLength?: "short" | "medium" | "detailed";
  explanationDepth?: "simple" | "standard" | "expert";
  nameUsage?: "never" | "rarely" | "greeting-only";
  followUps?: "suggest" | "none";
}
/** A customer context source the developer approved in the terminal. */
export interface SourceChoice {
  id: string;
  /** Endpoint path of the discovered candidate, the key used to match it on the next scan. */
  path: string;
  category: string;
  description: string;
  fields: string[];
  load: "initial" | "on-demand";
  authReviewed?: boolean;
  greeting?: string[];
}
/** Everything the control center manages beyond the 0.11 setup fields. */
export interface AgentChoices {
  agent?: {
    description?: string;
    instructions?: string;
    style?: StyleChoice;
    temperature?: number;
    maxSteps?: number;
    historyTurns?: number;
  };
  business?: {
    name?: string;
    description?: string;
    industry?: string;
    audience?: string;
    offerings?: string[];
    terminology?: string[];
    support?: string;
    policies?: string;
    sensitive?: boolean;
  };
  preset?: string;
  greeting?: {
    enabled?: boolean;
    guest?: string[];
    member?: string[];
    returning?: string[];
    frequency?: "once-per-session" | "every-open";
    delayMs?: number;
    showStarters?: boolean;
  };
  starters?: {
    label: string;
    prompt?: string;
    when?: { auth?: "guest" | "member"; requires?: string[] };
  }[];
  memory?: {
    mode: "session" | "persistent" | "preferences";
    resumeWithinHours?: number;
    preferenceDays?: number;
    retentionDays?: number;
    categories?: string[];
    clear?: "forget" | "delete";
    allowClear?: boolean;
  };
  /** Conversation store. MongoDB reads `SPEEQ_MONGODB_URI` and `SPEEQ_MONGODB_DB` from the environment. */
  store?: {
    kind: "memory" | "mongodb";
    status?: "configured" | "connection-verified" | "persistence-verified";
  };
  identity?: {
    /** The bound sign-in entry point from discovery. Absent: no `resolveUser` is generated. */
    binding?: AuthEntry;
    /** Label of the provider, for status lines. */
    provider?: string;
    expose?: ("displayName" | "preferredName" | "locale")[];
    status?: "generated" | "verified";
  };
  context?: {
    sources?: SourceChoice[];
    page?: { allow: string[]; store?: "keys" | "full" | "none" };
  };
  /** ISO time of the last passing `speeq verify` from the control center. */
  verifiedAt?: string;
}

const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : undefined;
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : undefined;
const strs = (v: unknown, n: number, max: number) =>
  Array.isArray(v)
    ? v
        .flatMap((x) => {
          const s = str(x, max);
          return s ? [s] : [];
        })
        .slice(0, n)
    : undefined;
const oneOf = <T extends string>(v: unknown, list: readonly T[]) =>
  typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined;
const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined;
const obj = (v: unknown) =>
  typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
/** Drops undefined values so the JSON stays small. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
const ID = /^[a-z][a-z0-9_]{0,40}$/;
const PATH = /^\/[A-Za-z0-9._~/-]*$/;
const ENTRY_KINDS = ["authjs", "nextauth-v4", "supabase", "better-auth", "clerk"] as const;
const FILE = /^(?!.*\.\.)[A-Za-z0-9._@()[\]/-]+\.[cm]?[jt]sx?$/;
const EXPORT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function readEntry(v: unknown): AuthEntry | undefined {
  const o = obj(v);
  const kind = oneOf(o?.kind, ENTRY_KINDS);
  if (!o || !kind) return undefined;
  if (kind === "clerk") return { kind };
  if (typeof o.file !== "string" || !FILE.test(o.file)) return undefined;
  if (typeof o.exportName !== "string" || !EXPORT.test(o.exportName)) return undefined;
  return { kind, file: o.file, exportName: o.exportName };
}

/**
 * Reads the control-center keys of a parsed `setup.json`. Anything malformed is dropped (it would be
 * rendered into code). Never throws.
 */
export function readAgentChoices(raw: unknown): AgentChoices {
  const v = obj(raw) ?? {};
  const out: AgentChoices = {};
  const a = obj(v.agent);
  if (a) {
    const s = obj(a.style);
    out.agent = compact({
      description: str(a.description, 400),
      instructions: text(a.instructions, 4000),
      style: s
        ? compact({
            personality: oneOf(s.personality, [
              "professional",
              "friendly",
              "conversational",
              "educational",
              "concise",
              "formal",
              "custom",
            ] as const),
            responseLength: oneOf(s.responseLength, ["short", "medium", "detailed"] as const),
            explanationDepth: oneOf(s.explanationDepth, ["simple", "standard", "expert"] as const),
            nameUsage: oneOf(s.nameUsage, ["never", "rarely", "greeting-only"] as const),
            followUps: oneOf(s.followUps, ["suggest", "none"] as const),
          })
        : undefined,
      temperature: num(a.temperature, 0, 2),
      maxSteps: num(a.maxSteps, 1, 12),
      historyTurns: num(a.historyTurns, 0, 50),
    });
  }
  const b = obj(v.business);
  if (b)
    out.business = compact({
      name: str(b.name, 80),
      description: str(b.description, 400),
      industry: str(b.industry, 60),
      audience: str(b.audience, 160),
      offerings: strs(b.offerings, 12, 80),
      terminology: strs(b.terminology, 20, 80),
      support: str(b.support, 160),
      policies: str(b.policies, 400),
      sensitive: b.sensitive === true ? true : undefined,
    });
  const preset = str(v.preset, 30);
  if (preset) out.preset = preset;
  const g = obj(v.greeting);
  if (g)
    out.greeting = compact({
      enabled: typeof g.enabled === "boolean" ? g.enabled : undefined,
      guest: strs(g.guest, 5, 300),
      member: strs(g.member, 5, 300),
      returning: strs(g.returning, 5, 300),
      frequency: oneOf(g.frequency, ["once-per-session", "every-open"] as const),
      delayMs: num(g.delayMs, 0, 10_000),
      showStarters: typeof g.showStarters === "boolean" ? g.showStarters : undefined,
    });
  if (Array.isArray(v.starters))
    out.starters = v.starters.slice(0, 12).flatMap((x) => {
      const s = obj(x);
      const label = str(s?.label, 60);
      if (!s || !label) return [];
      const w = obj(s.when);
      const when = w
        ? compact({
            auth: oneOf(w.auth, ["guest", "member"] as const),
            requires: strs(w.requires, 6, 80),
          })
        : undefined;
      return [
        compact({
          label,
          prompt: str(s.prompt, 300),
          when: when && Object.keys(when).length ? when : undefined,
        }),
      ];
    });
  const m = obj(v.memory);
  const mode = oneOf(m?.mode, ["session", "persistent", "preferences"] as const);
  if (m && mode)
    out.memory = compact({
      mode,
      resumeWithinHours: num(m.resumeWithinHours, 1, 2160),
      preferenceDays: num(m.preferenceDays, 1, 3650),
      retentionDays: num(m.retentionDays, 1, 3650),
      categories: strs(m.categories, 5, 40)?.filter((c) =>
        [
          "language",
          "explanation_depth",
          "subject",
          "product_category",
          "communication_style",
        ].includes(c),
      ),
      clear: oneOf(m.clear, ["forget", "delete"] as const),
      allowClear: typeof m.allowClear === "boolean" ? m.allowClear : undefined,
    });
  const st = obj(v.store);
  const kind = oneOf(st?.kind, ["memory", "mongodb"] as const);
  if (st && kind)
    out.store = compact({
      kind,
      status: oneOf(st.status, [
        "configured",
        "connection-verified",
        "persistence-verified",
      ] as const),
    });
  const i = obj(v.identity);
  if (i) {
    const binding = readEntry(i.binding);
    out.identity = compact({
      binding,
      provider: str(i.provider, 40),
      expose: strs(i.expose, 3, 20)?.filter((x): x is "displayName" | "preferredName" | "locale" =>
        ["displayName", "preferredName", "locale"].includes(x),
      ),
      status: binding ? oneOf(i.status, ["generated", "verified"] as const) : undefined,
    });
  }
  const c = obj(v.context);
  if (c) {
    const sources = Array.isArray(c.sources)
      ? c.sources.slice(0, 20).flatMap((x): SourceChoice[] => {
          const s = obj(x);
          if (!s || typeof s.id !== "string" || !ID.test(s.id)) return [];
          if (typeof s.path !== "string" || !PATH.test(s.path)) return [];
          const fields = strs(s.fields, 30, 120) ?? [];
          if (!fields.length) return [];
          return [
            compact({
              id: s.id,
              path: s.path,
              category: str(s.category, 20) ?? "custom",
              description: str(s.description, 200) ?? s.id,
              fields,
              load: oneOf(s.load, ["initial", "on-demand"] as const) ?? "on-demand",
              authReviewed: s.authReviewed === true ? true : undefined,
              greeting: strs(s.greeting, 5, 120)?.filter((f) => fields.includes(f)),
            }),
          ];
        })
      : undefined;
    const p = obj(c.page);
    const allow = strs(p?.allow, 30, 60);
    out.context = compact({
      sources: sources?.length ? sources : undefined,
      page: allow
        ? compact({ allow, store: oneOf(p?.store, ["keys", "full", "none"] as const) })
        : undefined,
    });
  }
  const at = str(v.verifiedAt, 40);
  if (at && !Number.isNaN(Date.parse(at))) out.verifiedAt = at;
  return out;
}

/** True when any control-center setting is present (the setup file is then version 2). */
export function hasAgentChoices(c: AgentChoices): boolean {
  return Object.keys(c).some((k) => k !== "verifiedAt");
}

const DEFAULT_INSTRUCTIONS =
  "You help people use this website. Use the tools and routes you are given. Say so when you cannot do something.";

/** Paths of the generated settings files for an app prefix. */
export function settingsPaths(prefix: string) {
  const dir = `${prefix}.speeq/generated`;
  return {
    agent: `${dir}/agent.ts`,
    identity: `${dir}/identity.ts`,
    context: `${dir}/context.ts`,
    config: `${prefix}speeq.config.ts`,
  };
}

const lit = (v: unknown) => JSON.stringify(v);
function objectLiteral(o: Record<string, unknown>, indent: string): string {
  const entries = Object.entries(o).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, v]) => `${indent}  ${k}: ${lit(v)},`).join("\n")}\n${indent}}`;
}

/**
 * Source of `<generatedDir>/agent.ts` (sealed). `name` and `languages` are the 0.11 setup fields.
 * `hasIdentity` / `hasContext` say whether `identity.ts` / `context.ts` are generated next to it.
 */
export function renderAgentModule(o: {
  choices: AgentChoices;
  name: string;
  languages: readonly string[];
  hasIdentity: boolean;
  hasContext: boolean;
}): string {
  const c = o.choices;
  const imports: string[] = [imp("type { AgentConfig, SpeeqConfig }", "speeq/server")];
  if (o.hasIdentity) imports.push(imp("{ resolveUser }", "./identity"));
  if (o.hasContext) imports.push(imp("{ contextProviders }", "./context"));
  const mongo = c.store?.kind === "mongodb";
  if (mongo) {
    imports.push(imp("{ MongoClient }", "mongodb"));
    imports.push(imp("{ createMongoStore }", "speeq/store-mongodb"));
  }
  const a = c.agent ?? {};
  const profile = objectLiteral(
    {
      name: o.name,
      instructions: a.instructions ?? DEFAULT_INSTRUCTIONS,
      description: a.description,
      style: a.style && Object.keys(a.style).length ? a.style : undefined,
      languages: o.languages.length ? [...o.languages] : undefined,
      temperature: a.temperature,
      maxSteps: a.maxSteps,
      historyTurns: a.historyTurns,
    },
    "",
  );
  const lines: string[] = [];
  const set = (key: string, value: unknown) => {
    if (value !== undefined) lines.push(`  ${key}: ${lit(value)},`);
  };
  set("business", c.business && Object.keys(c.business).length ? c.business : undefined);
  if (c.greeting && Object.keys(c.greeting).length) set("greeting", c.greeting);
  if (c.starters?.length) set("starters", c.starters);
  if (c.memory) set("memory", c.memory);
  if (c.identity?.expose?.length) set("identity", { expose: c.identity.expose });
  if (o.hasIdentity) {
    lines.push("  // The signed-in user comes from your app's own session (see ./identity.ts).");
    lines.push("  resolveUser,");
    lines.push("  // Visitors who are not signed in can still use the assistant.");
    lines.push("  allowAnonymous: true,");
  }
  const page = c.context?.page;
  if (o.hasContext || page) {
    const parts = [
      ...(o.hasContext ? ["providers: contextProviders"] : []),
      ...(page ? [`page: ${lit(page)}`] : []),
    ];
    lines.push(`  context: { ${parts.join(", ")} },`);
  }
  if (mongo) {
    lines.push(
      "  // Conversations are kept in your MongoDB (SPEEQ_MONGODB_URI and SPEEQ_MONGODB_DB).",
    );
    lines.push("  store: createMongoStore({ db: mongoDb }),");
  }
  const mongoBlock = mongo
    ? [
        "",
        "// One client per server process, created on first use (never at build time).",
        "const cache = globalThis as { __speeqMongo?: Promise<MongoClient> };",
        "function mongoDb() {",
        "  const uri = process.env.SPEEQ_MONGODB_URI;",
        '  if (!uri) throw new Error("SPEEQ_MONGODB_URI is not set. Add it to .env.local or run `npx speeq setup`.");',
        "  cache.__speeqMongo ??= MongoClient.connect(uri);",
        "  return cache.__speeqMongo.then((client) => client.db(process.env.SPEEQ_MONGODB_DB || undefined));",
        "}",
      ]
    : [];
  const body = [
    "// Written by `npx speeq setup` from .speeq/setup.json. Change settings there, not here:",
    "// hand edits are overwritten on the next save. Server-only: import it from speeq.config.ts only.",
    ...imports,
    ...mongoBlock,
    "",
    "/** Who the assistant is and how it talks. */",
    `export const agentProfile = ${profile} satisfies AgentConfig;`,
    "",
    "/** Everything else `speeq setup` manages. Properties written after `...agentSettings` win. */",
    `export const agentSettings = {${lines.length ? `\n${lines.join("\n")}\n` : ""}} satisfies Partial<SpeeqConfig>;`,
    "",
  ].join("\n");
  return seal(body);
}

/** Keys of `agentSettings` that a property written after the spread in speeq.config.ts would override. */
const MANAGED_KEYS = [
  "business",
  "greeting",
  "starters",
  "memory",
  "identity",
  "resolveUser",
  "allowAnonymous",
  "context",
];
const AGENT_KEYS = [
  "name",
  "instructions",
  "description",
  "style",
  "languages",
  "temperature",
  "maxSteps",
  "historyTurns",
];

/** Whether `speeq.config.ts` already spreads the generated settings. */
export function agentWiring(text: string): "wired" | "not-wired" | "unknown" {
  if (!/\bcreateSpeeq\s*\(\s*\{/.test(text)) return "unknown";
  return /\.\.\.agentSettings\b/.test(text) && /\bagentProfile\b/.test(text)
    ? "wired"
    : "not-wired";
}

/** Top-level property names of the `createSpeeq({ ... })` object literal, in order. */
function topLevelKeys(text: string): { keys: string[]; open: number; close: number } | undefined {
  const m = /\bcreateSpeeq\s*\(\s*\{/.exec(text);
  if (!m) return undefined;
  const open = m.index + m[0].length - 1;
  const keys: string[] = [];
  let depth = 0;
  let atStart = true;
  for (let i = open; i < text.length; i++) {
    const ch = text[i] as string;
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) return undefined;
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === "\\") i++;
      atStart = false;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") {
      depth++;
      if (depth === 1) atStart = true;
      continue;
    }
    if (ch === "}" || ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) return { keys, open, close: i };
      continue;
    }
    if (depth !== 1) continue;
    if (ch === ",") {
      atStart = true;
      continue;
    }
    if (atStart && /\s/.test(ch)) continue;
    if (atStart) {
      const k = /^(\.\.\.[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)/.exec(text.slice(i));
      if (k?.[1]) keys.push(k[1]);
      atStart = false;
    }
  }
  return undefined;
}

/**
 * Wires the generated settings into `speeq.config.ts`: one import, `...agentSettings,` as the first
 * property of `createSpeeq({`, and the agent object. The `agent` property `speeq init` wrote is
 * replaced by `agentProfile`; a hand-written one keeps its keys after `...agentProfile`, and those keys
 * are reported as overrides. Never removes developer code it does not recognise. Idempotent.
 */
export function wireAgentSettings(
  text: string,
  o: { configFile: string; agentFile: string; mongo?: boolean },
): { text: string; overrides: string[]; notes: string[] } | { reason: string } {
  const shape = topLevelKeys(text);
  if (!shape) return { reason: "no `createSpeeq({ ... })` call was found" };
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  let out = text;
  const notes: string[] = [];
  if (agentWiring(text) !== "wired") {
    const spec = importPath(o.configFile, o.agentFile);
    const line = imp("{ agentProfile, agentSettings }", spec);
    if (!out.includes(line)) {
      const found = [...out.matchAll(/^import[^;]*;[ \t]*\r?\n/gm)];
      const last = found[found.length - 1];
      const at = last ? last.index + last[0].length : 0;
      out = `${out.slice(0, at)}${line}${nl}${out.slice(at)}`;
    }
    const open = /\bcreateSpeeq\s*\(\s*\{/.exec(out);
    if (!open) return { reason: "no `createSpeeq({ ... })` call was found" };
    const at = open.index + open[0].length;
    out = `${out.slice(0, at)}${nl}  ...agentSettings,${out.slice(at)}`;
    // The agent object `speeq init` wrote, on one line: replace it whole.
    const generated =
      /^([ \t]*)agent:\s*\{\s*name:\s*"[^"\n]*",\s*instructions:\s*"[^"\n]*"(?:,\s*languages:\s*\[[^\]\n]*\])?\s*\},[ \t]*$/m;
    if (generated.test(out)) out = out.replace(generated, "$1agent: agentProfile,");
    else {
      const agentOpen = /^([ \t]*)agent:\s*\{/m.exec(out);
      if (agentOpen) {
        const at2 = agentOpen.index + agentOpen[0].length;
        out = `${out.slice(0, at2)} ...agentProfile,${out.slice(at2)}`;
      } else if (/^[ \t]*agent\s*:/m.test(out))
        return { reason: "the `agent` property is not an object literal" };
      else {
        const spread = out.indexOf("...agentSettings,");
        const at3 = spread + "...agentSettings,".length;
        out = `${out.slice(0, at3)}${nl}  agent: agentProfile,${out.slice(at3)}`;
      }
    }
  }
  if (o.mongo) {
    // The in-memory store `speeq init` wrote would override the MongoDB store: take it out.
    const before = out;
    out = out.replace(/^[ \t]*\/\/ In-memory store:[^\n]*\r?\n/m, "");
    out = out.replace(
      /^[ \t]*store\s*(?::\s*(?:store|createMemoryStore\(\)))?\s*,[ \t]*\r?\n/m,
      "",
    );
    if (out === before && /^[ \t]*store\s*:/m.test(out))
      notes.push(
        "speeq.config.ts sets its own `store`, so the MongoDB store from setup is not used.",
      );
  }
  // What the developer's own properties override.
  const after = topLevelKeys(out);
  const overrides: string[] = [];
  if (after) {
    const spreadAt = after.keys.indexOf("...agentSettings");
    for (const k of after.keys.slice(spreadAt + 1))
      if (MANAGED_KEYS.includes(k) || (o.mongo && k === "store")) overrides.push(k);
    const agent = /^[ \t]*agent:\s*\{\s*\.\.\.agentProfile,([\s\S]*?)\n[ \t]*\},/m.exec(out);
    if (agent?.[1])
      for (const k of AGENT_KEYS)
        if (new RegExp(`(^|[\\s,{])${k}\\s*:`).test(agent[1])) overrides.push(`agent.${k}`);
  }
  return { text: out, overrides: [...new Set(overrides)], notes };
}

/** One line on the control center home screen. */
export interface SectionStatus {
  id: SectionId;
  title: string;
  badge: "set" | "review" | "off" | "broken";
  detail: string;
}
/** The twelve sections, in home-screen order. */
export const SECTIONS = [
  { id: "agent", title: "Agent identity and personality" },
  { id: "business", title: "Business information" },
  { id: "model", title: "Model provider and behavior" },
  { id: "voice", title: "Voice and languages" },
  { id: "auth", title: "Authentication and identity" },
  { id: "context", title: "Customer context and permissions" },
  { id: "page", title: "Page and application context" },
  { id: "greeting", title: "Greetings and starter prompts" },
  { id: "memory", title: "Conversation memory" },
  { id: "storage", title: "Storage and retention" },
  { id: "chat", title: "Chat box appearance" },
  { id: "verify", title: "Verification and diagnostics" },
] as const;
/** Id of a control center section. */
export type SectionId = (typeof SECTIONS)[number]["id"];

/** What the home screen knows, gathered by the CLI. No secrets: key presence only. */
export interface ControlInput {
  choices: AgentChoices;
  provider: string;
  model?: string;
  /** The provider's key is in `.env.local` / `.env` (or it needs none). */
  keyPresent: boolean;
  voice: string;
  languages: string[];
  ui: boolean;
  /** Best auth candidate from discovery, if any. */
  auth?: { provider: string; label: string; level: string };
  /** Discovered data source candidates. */
  sourceCount: number;
  /** speeq.config.ts spreads the generated settings. */
  wiring: "wired" | "not-wired" | "unknown";
  /** `SPEEQ_MONGODB_URI` is set somewhere the app reads. */
  mongoUriPresent: boolean;
}

/** One status per section, from facts only. */
export function sectionStatuses(i: ControlInput): SectionStatus[] {
  const c = i.choices;
  const title = (id: SectionId) => SECTIONS.find((s) => s.id === id)?.title ?? id;
  const row = (id: SectionId, badge: SectionStatus["badge"], detail: string): SectionStatus => ({
    id,
    title: title(id),
    badge,
    detail,
  });
  const out: SectionStatus[] = [];
  const style = c.agent?.style?.personality;
  out.push(
    row(
      "agent",
      c.agent || c.preset ? "set" : "off",
      [style ?? (c.agent ? "custom" : "default"), c.preset ? `${c.preset} preset` : ""]
        .filter(Boolean)
        .join(" · ") || "default assistant",
    ),
  );
  out.push(
    c.business?.description
      ? row("business", "set", c.business.name ?? c.business.description.slice(0, 40))
      : row("business", "review", "not described yet"),
  );
  out.push(
    i.provider === "mock"
      ? row("model", "set", "Mock (canned replies)")
      : i.keyPresent
        ? row("model", "set", `${i.provider}${i.model ? ` · ${i.model}` : ""}`)
        : row("model", "broken", `${i.provider}: key missing`),
  );
  out.push(row("voice", "set", `${i.voice} · ${i.languages.join(", ")}`));
  const bound = c.identity?.binding;
  out.push(
    bound
      ? row(
          "auth",
          "set",
          `${c.identity?.provider ?? bound.kind}, ${c.identity?.status === "verified" ? "bound and verified" : "bound"}`,
        )
      : i.auth?.level === "implementation-detected"
        ? row("auth", "review", `${i.auth.label} detected, not bound`)
        : i.auth
          ? row("auth", "review", `${i.auth.label}: ${i.auth.level.replace(/-/g, " ")}`)
          : row("auth", "off", "no sign-in found (everyone is a guest)"),
  );
  const sources = c.context?.sources?.length ?? 0;
  out.push(
    sources
      ? row("context", "set", `${sources} source${sources > 1 ? "s" : ""} approved`)
      : i.sourceCount
        ? row(
            "context",
            "review",
            `${i.sourceCount} candidate${i.sourceCount > 1 ? "s" : ""} to review`,
          )
        : row("context", "off", "no customer data sources found"),
  );
  out.push(
    c.context?.page
      ? row("page", "set", `${c.context.page.allow.length} page keys allowed`)
      : row("page", "off", "path and title only"),
  );
  const greet =
    c.greeting?.enabled === false
      ? "off"
      : c.greeting?.guest?.length || c.greeting?.member?.length
        ? "set"
        : "off";
  out.push(
    row(
      "greeting",
      greet,
      greet === "set" ? `${(c.starters ?? []).length} starters` : "chat box default",
    ),
  );
  const mode = c.memory?.mode ?? "session";
  out.push(
    mode !== "session" && !bound && !i.auth
      ? row("memory", "review", `${mode}, but nobody signs in`)
      : row(
          "memory",
          mode === "session" ? "off" : "set",
          mode === "session" ? "this conversation only" : mode,
        ),
  );
  const store = c.store?.kind ?? "memory";
  out.push(
    store === "mongodb"
      ? i.mongoUriPresent
        ? row("storage", "set", `MongoDB · ${(c.store?.status ?? "configured").replace(/-/g, " ")}`)
        : row("storage", "broken", "MongoDB chosen, SPEEQ_MONGODB_URI missing")
      : row("storage", mode !== "session" ? "review" : "set", "memory (development)"),
  );
  out.push(row("chat", i.ui ? "set" : "off", i.ui ? "generated chat box" : "not added"));
  out.push(
    c.verifiedAt
      ? row("verify", "set", `passed ${c.verifiedAt.slice(0, 10)}`)
      : row("verify", "review", "not run from setup yet"),
  );
  if (i.wiring === "unknown")
    out[0] = row("agent", "broken", "speeq.config.ts missing or without createSpeeq({ ... })");
  return out;
}

/** The one thing to do next, ranked: broken > security review > unbound detection > persistence > polish. */
export interface Recommendation {
  section: SectionId;
  text: string;
  minutes: number;
}
export function recommend(
  i: ControlInput,
  statuses = sectionStatuses(i),
): Recommendation | undefined {
  const by = (id: SectionId) => statuses.find((s) => s.id === id);
  const broken = statuses.find((s) => s.badge === "broken");
  if (broken?.id === "model")
    return {
      section: "model",
      text: `Add your ${i.provider} key so the assistant can answer`,
      minutes: 1,
    };
  if (broken?.id === "storage")
    return {
      section: "storage",
      text: "Add the MongoDB connection so conversations are kept",
      minutes: 2,
    };
  if (broken)
    return {
      section: broken.id,
      text: `Fix ${broken.title.toLowerCase()}: ${broken.detail}`,
      minutes: 2,
    };
  if (i.auth?.level === "requires-review" && !i.choices.identity?.binding)
    return {
      section: "auth",
      text: `Review the sign-in code speeq found (${i.auth.label})`,
      minutes: 2,
    };
  if (i.auth?.level === "implementation-detected" && !i.choices.identity?.binding)
    return {
      section: "auth",
      text: `Bind ${i.auth.label} so the agent knows who is signed in`,
      minutes: 1,
    };
  if (i.choices.identity?.binding && by("context")?.badge === "review")
    return {
      section: "context",
      text: "Review the customer data speeq found and approve the fields the agent may use",
      minutes: 3,
    };
  if (
    (i.choices.memory?.mode ?? "session") !== "session" &&
    (i.choices.store?.kind ?? "memory") === "memory"
  )
    return {
      section: "storage",
      text: "Use MongoDB so remembered conversations survive restarts",
      minutes: 2,
    };
  if (by("business")?.badge === "review")
    return {
      section: "business",
      text: "Describe your business in one sentence so answers sound like you",
      minutes: 1,
    };
  if (by("greeting")?.badge === "off")
    return {
      section: "greeting",
      text: "Set a greeting and starter prompts that match your app",
      minutes: 1,
    };
  if (by("verify")?.badge !== "set")
    return { section: "verify", text: "Run the checks to confirm everything works", minutes: 1 };
  return undefined;
}

/** Restart hint after a save. */
export function restartHint(files: readonly string[]): string {
  return files.some((f) => /\.env/.test(f))
    ? "Restart your dev server so it reads the new environment values."
    : "Your dev server picks this up on the next request (restart it if it does not).";
}

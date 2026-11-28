import {
  type AgentUser,
  DEFAULT_LANGUAGES,
  type KnowledgeSource,
  LanguageSchema,
  SpeeqError,
} from "@speeq/core";
import {
  type AuditConfig,
  PREFERENCE_CATEGORIES,
  type PreferenceCategory,
  type SpeeqConfig,
  type SpeeqLogger,
} from "./config.js";
import { CONTEXT_CATEGORIES } from "./context/define.js";
import type { ResolvedPagePolicy } from "./context/page.js";
import { exposeTree, isExposePath } from "./context/project.js";
import type { ContextBudget, ResolvedProvider } from "./context/run.js";
import type { RouteDefinition, ToolDefinition, UiActionDefinition } from "./define.js";

/** A tool after defaults are applied. */
export interface ResolvedTool<TUser extends AgentUser = AgentUser> {
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous tool inputs, validated per tool.
  def: ToolDefinition<any, TUser>;
  needsConfirmation: boolean;
  timeoutMs: number;
}

/** Configuration with every default filled in. Internal. */
export interface ResolvedConfig<TUser extends AgentUser = AgentUser> {
  raw: SpeeqConfig<TUser>;
  secret: string;
  agentName: string;
  instructions: string;
  languages: string[];
  defaultLanguage: string;
  maxSteps: number;
  historyTurns: number;
  /** Silence allowed from the model, see `agent.modelTimeoutMs`. */
  modelTimeoutMs: number;
  allowAnonymous: boolean;
  /** Context sources by id. */
  contextProviders: Map<string, ResolvedProvider<TUser>>;
  /** `null` when the config has no `context.page` block. */
  contextPage: ResolvedPagePolicy | null;
  contextBudget: ContextBudget;
  /** Exposed profile fields, validated. */
  identityExpose: ("displayName" | "preferredName" | "locale")[];
  routes: Map<string, RouteDefinition>;
  tools: Map<string, ResolvedTool<TUser>>;
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous UI action inputs, validated per action.
  uiActions: Map<string, UiActionDefinition<any, TUser>>;
  uiActionsPerTurn: number;
  uiActionsPerSession: number;
  knowledge: KnowledgeSource<TUser>[];
  audit: AuditConfig;
  maxToolOutputChars: number;
  turnsPerMinute: number | null;
  sessionsPerMinute: number | null;
  maxRequestBytes: number;
  sessionTtlSeconds: number;
  allowedOrigins: string[];
  logger: SpeeqLogger;
  memory: ResolvedMemory;
}

/** Memory settings with defaults. */
export interface ResolvedMemory {
  mode: "session" | "persistent" | "preferences";
  resumeWithinHours: number;
  historyTurns: number;
  preferenceDays: number;
  categories: PreferenceCategory[];
  clear: "forget" | "delete";
  /** Clearing is allowed and the store can do it. */
  canClear: boolean;
  /** Days conversations are kept: the smaller of `memory.retentionDays` and `audit.retentionDays`. */
  retentionDays: number | undefined;
}

/** Names reserved for built-in tools. */
export const BUILTIN_TOOL_NAMES = [
  "navigate",
  "search_knowledge",
  "get_context",
  "remember_preference",
] as const;

const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const UI_ACTION_NAME_RE = /^ui_[a-z0-9_]{1,60}$/;
const ROUTE_ID_RE = /^[a-zA-Z0-9_.-]{1,64}$/;
const PROVIDER_ID_RE = /^[a-z][a-z0-9_]{0,40}$/;
const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : lo;

const defaultLogger: SpeeqLogger = {
  error: (m, d) => console.error(`[speeq] ${m}`, d ?? ""),
  warn: (m, d) => console.warn(`[speeq] ${m}`, d ?? ""),
};

function isProduction(): boolean {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.NODE_ENV === "production";
}

let devSecret: string | undefined;

/**
 * Validates the configuration and applies defaults. Throws `NOT_CONFIGURED` with a clear message
 * for mistakes that would otherwise fail later (duplicate tool names, bad routes, no secret).
 */
export function resolveConfig<TUser extends AgentUser>(
  config: SpeeqConfig<TUser>,
): ResolvedConfig<TUser> {
  const logger = config.logger ?? defaultLogger;
  const fail = (message: string) =>
    new SpeeqError("NOT_CONFIGURED", { message: `speeq: ${message}` });
  if (!config.llm) throw fail("`llm` is required.");
  if (!config.store) throw fail("`store` is required.");
  if (!config.agent?.name || typeof config.agent.instructions !== "string") {
    throw fail("`agent.name` and `agent.instructions` are required.");
  }

  let secret = config.secret;
  if (!secret) {
    if (isProduction()) throw fail("`secret` (SPEEQ_SECRET) is required in production.");
    devSecret ??= crypto.randomUUID() + crypto.randomUUID();
    secret = devSecret;
    logger.warn(
      "No `secret` set: using a random development secret. Set SPEEQ_SECRET in production.",
    );
  } else if (secret.length < 32) {
    logger.warn("`secret` is shorter than 32 characters. Use a long random value.");
  }

  const languages = config.agent.languages?.length
    ? config.agent.languages
    : [...DEFAULT_LANGUAGES];
  for (const l of languages) {
    if (!LanguageSchema.safeParse(l).success) throw fail(`invalid language tag "${l}".`);
  }
  const defaultLanguage = config.agent.defaultLanguage ?? languages[0] ?? "en-IN";
  if (!languages.includes(defaultLanguage))
    throw fail("`agent.defaultLanguage` must be in `agent.languages`.");

  const exposable = ["displayName", "preferredName", "locale"] as const;
  const identityExpose: (typeof exposable)[number][] = [];
  for (const field of config.identity?.expose ?? []) {
    if (!(exposable as readonly string[]).includes(field))
      throw fail(
        `identity.expose: "${String(field)}" cannot be exposed (allowed: ${exposable.join(", ")}).`,
      );
    if (!identityExpose.includes(field)) identityExpose.push(field);
  }

  const routes = new Map<string, RouteDefinition>();
  for (const r of config.routes ?? []) {
    if (!ROUTE_ID_RE.test(r.id)) throw fail(`route id "${r.id}" must match ${ROUTE_ID_RE}.`);
    if (!r.path.startsWith("/")) throw fail(`route "${r.id}" path must start with "/".`);
    if (routes.has(r.id)) throw fail(`duplicate route id "${r.id}".`);
    routes.set(r.id, r);
  }

  const toolTimeoutMs = config.guardrails?.toolTimeoutMs ?? 8000;
  const tools = new Map<string, ResolvedTool<TUser>>();
  for (const def of config.tools ?? []) {
    if (!TOOL_NAME_RE.test(def.name))
      throw fail(`tool name "${def.name}" must match ${TOOL_NAME_RE}.`);
    if ((BUILTIN_TOOL_NAMES as readonly string[]).includes(def.name)) {
      throw fail(`tool name "${def.name}" is reserved for a built-in tool.`);
    }
    if (tools.has(def.name)) throw fail(`duplicate tool name "${def.name}".`);
    tools.set(def.name, {
      def,
      needsConfirmation: def.requiresConfirmation ?? def.risk === "write",
      timeoutMs: def.timeoutMs ?? toolTimeoutMs,
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous UI action inputs, validated per action.
  const uiActions = new Map<string, UiActionDefinition<any, TUser>>();
  for (const def of config.uiActions ?? []) {
    if (!UI_ACTION_NAME_RE.test(def.name))
      throw fail(`UI action name "${def.name}" must match ${UI_ACTION_NAME_RE}.`);
    if (uiActions.has(def.name)) throw fail(`duplicate UI action name "${def.name}".`);
    if (tools.has(def.name) || routes.has(def.name))
      throw fail(`UI action name "${def.name}" collides with a tool or route.`);
    if (def.risk !== "read" && def.risk !== "write")
      throw fail(`UI action "${def.name}" needs \`risk\` ("read" or "write").`);
    if (typeof def.summary !== "function")
      throw fail(`UI action "${def.name}" needs a \`summary\` function.`);
    uiActions.set(def.name, def);
  }

  const ids = new Set<string>();
  for (const k of config.knowledge ?? []) {
    if (uiActions.has(k.id)) throw fail(`knowledge source id "${k.id}" collides with a UI action.`);
    if (ids.has(k.id)) throw fail(`duplicate knowledge source id "${k.id}".`);
    ids.add(k.id);
  }

  const contextProviders = new Map<string, ResolvedProvider<TUser>>();
  for (const def of config.context?.providers ?? []) {
    const where = `context source "${String(def?.id)}"`;
    if (!PROVIDER_ID_RE.test(def?.id ?? ""))
      throw fail(`${where}: id must match ${PROVIDER_ID_RE}.`);
    if (contextProviders.has(def.id)) throw fail(`duplicate context source id "${def.id}".`);
    if (!def.description?.trim()) throw fail(`${where} needs a \`description\`.`);
    if (!CONTEXT_CATEGORIES.includes(def.category))
      throw fail(`${where}: category must be one of ${CONTEXT_CATEGORIES.join(", ")}.`);
    if (typeof def.fetch !== "function") throw fail(`${where} needs a \`fetch\` function.`);
    if (typeof def.output?.safeParse !== "function")
      throw fail(`${where} needs an \`output\` schema.`);
    if (!Array.isArray(def.expose) || def.expose.length === 0)
      throw fail(`${where} needs a non-empty \`expose\` list: only listed fields reach the model.`);
    for (const p of def.expose)
      if (!isExposePath(p)) throw fail(`${where}: "${p}" is not a valid expose path.`);
    for (const g of def.greeting ?? [])
      if (!def.expose.includes(g)) throw fail(`${where}: greeting field "${g}" must be exposed.`);
    if (def.auth !== undefined && def.auth !== "required" && def.auth !== "optional")
      throw fail(`${where}: auth must be "required" or "optional".`);
    if (def.load !== undefined && def.load !== "initial" && def.load !== "on-demand")
      throw fail(`${where}: load must be "initial" or "on-demand".`);
    contextProviders.set(def.id, {
      def,
      auth: def.auth ?? "required",
      load: def.load ?? "on-demand",
      tree: exposeTree(def.expose),
      maxItems: clamp(def.maxItems ?? 20, 1, 100),
      maxChars: clamp(def.maxChars ?? 2000, 100, 20_000),
      timeoutMs: clamp(def.timeoutMs ?? 1500, 50, 15_000),
    });
  }
  const page = config.context?.page;
  if (page && (!Array.isArray(page.allow) || page.allow.some((k) => typeof k !== "string")))
    throw fail("`context.page.allow` must be a list of data keys.");
  if (page?.store !== undefined && !["keys", "full", "none"].includes(page.store))
    throw fail('`context.page.store` must be "keys", "full" or "none".');
  const budget = config.context?.budget;

  const memory = resolveMemory(config, logger, fail);

  const rl = config.guardrails?.rateLimit;
  return {
    raw: config,
    secret,
    agentName: config.agent.name,
    instructions: config.agent.instructions,
    languages,
    defaultLanguage,
    maxSteps: Math.max(1, Math.min(config.agent.maxSteps ?? 5, 12)),
    historyTurns: Math.max(0, config.agent.historyTurns ?? 8),
    modelTimeoutMs: clamp(config.agent.modelTimeoutMs ?? 20_000, 3000, 120_000),
    allowAnonymous: config.allowAnonymous ?? config.resolveUser === undefined,
    identityExpose,
    contextProviders,
    contextPage: page
      ? {
          allow: new Set(page.allow),
          maxBytes: clamp(page.maxBytes ?? 2000, 100, 16_000),
          store: page.store ?? "keys",
        }
      : null,
    contextBudget: {
      maxInitial: clamp(budget?.maxInitial ?? 2, 0, 6),
      maxCalls: clamp(budget?.maxCalls ?? 4, 1, 12),
      maxChars: clamp(budget?.maxChars ?? 6000, 500, 40_000),
    },
    routes,
    tools,
    uiActions,
    uiActionsPerTurn: Math.max(1, config.guardrails?.uiActionsPerTurn ?? 5),
    uiActionsPerSession: Math.max(1, config.guardrails?.uiActionsPerSession ?? 30),
    knowledge: config.knowledge ?? [],
    audit: config.audit ?? {},
    maxToolOutputChars: config.guardrails?.maxToolOutputChars ?? 8000,
    turnsPerMinute: rl === false ? null : (rl?.turnsPerMinute ?? 20),
    sessionsPerMinute: rl === false ? null : (rl?.sessionsPerMinute ?? 10),
    maxRequestBytes: config.guardrails?.maxRequestBytes ?? 32 * 1024,
    sessionTtlSeconds: config.guardrails?.sessionTtlSeconds ?? 12 * 3600,
    allowedOrigins: config.allowedOrigins ?? [],
    logger,
    memory,
  };
}

function resolveMemory<TUser extends AgentUser>(
  config: SpeeqConfig<TUser>,
  logger: SpeeqLogger,
  fail: (message: string) => SpeeqError,
): ResolvedMemory {
  const m = config.memory ?? {};
  const mode = m.mode ?? "session";
  if (!["session", "persistent", "preferences"].includes(mode))
    throw fail('`memory.mode` must be "session", "persistent" or "preferences".');
  if (m.clear !== undefined && m.clear !== "forget" && m.clear !== "delete")
    throw fail('`memory.clear` must be "forget" or "delete".');
  const categories = m.categories ?? [...PREFERENCE_CATEGORIES];
  for (const c of categories)
    if (!(PREFERENCE_CATEGORIES as readonly string[]).includes(c))
      throw fail(
        `memory.categories: "${String(c)}" is not a preference category (allowed: ${PREFERENCE_CATEGORIES.join(", ")}).`,
      );
  const store = config.store;
  const missing: string[] = [];
  if (mode !== "session" && typeof store.clearScope !== "function") missing.push("clearScope");
  if (mode === "preferences") {
    if (typeof store.getPreferences !== "function") missing.push("getPreferences");
    if (typeof store.setPreference !== "function") missing.push("setPreference");
  }
  if (missing.length > 0)
    throw fail(
      `memory.mode "${mode}" needs a store with ${missing.join(", ")} (the memory and MongoDB stores have them; store "${store.kind}" does not).`,
    );
  if (mode !== "session" && !config.resolveUser)
    logger.warn(
      "memory.mode keeps conversations, but `resolveUser` is not set: every visitor is anonymous, so nothing is kept between visits.",
    );
  const days = [m.retentionDays, config.audit?.retentionDays].filter(
    (d): d is number => typeof d === "number" && d > 0,
  );
  return {
    mode,
    resumeWithinHours: clamp(m.resumeWithinHours ?? 72, 1, 2160),
    historyTurns: clamp(m.historyTurns ?? 20, 1, 100),
    preferenceDays: clamp(m.preferenceDays ?? 180, 1, 3650),
    categories: [...new Set(categories)],
    clear: m.clear ?? "forget",
    canClear: m.allowClear !== false && typeof store.clearScope === "function",
    retentionDays: days.length > 0 ? Math.min(...days) : undefined,
  };
}

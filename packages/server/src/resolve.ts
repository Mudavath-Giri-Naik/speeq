import {
  type AgentUser,
  DEFAULT_LANGUAGES,
  type KnowledgeSource,
  LanguageSchema,
  SpeeqError,
} from "@speeq/core";
import type { AuditConfig, SpeeqConfig, SpeeqLogger } from "./config.js";
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
  allowAnonymous: boolean;
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
}

/** Names reserved for built-in tools. */
export const BUILTIN_TOOL_NAMES = ["navigate", "search_knowledge"] as const;

const TOOL_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const UI_ACTION_NAME_RE = /^ui_[a-z0-9_]{1,60}$/;
const ROUTE_ID_RE = /^[a-zA-Z0-9_.-]{1,64}$/;

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
    allowAnonymous: config.allowAnonymous ?? config.resolveUser === undefined,
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
  };
}

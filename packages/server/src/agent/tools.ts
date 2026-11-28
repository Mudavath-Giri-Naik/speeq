import {
  type AgentContext,
  type AgentUser,
  combineSignals,
  type ErrorCode,
  isAbortError,
  isSpeeqError,
  type JsonSchema,
  type LLMToolCall,
  type LLMToolDefinition,
  looksSecret,
  redactText,
  SpeeqError,
  safeJsonStringify,
  type ToolKind,
  truncate,
} from "@speeq/core";
import { z } from "zod";
import { loadContext } from "../context/run.js";
import { memoryScope } from "../handler/memory.js";
import type { ResolvedConfig, ResolvedTool } from "../resolve.js";
import { type NavigationTarget, resolveNavigation } from "./routes.js";

/** What happened when a tool call was handled. */
export interface ToolOutcome {
  kind: ToolKind;
  ok: boolean;
  /** Text the model sees as the tool result. */
  content: string;
  truncated: boolean;
  durationMs: number;
  errorCode?: ErrorCode;
  /** Set when the built-in `navigate` tool succeeded. */
  navigation?: NavigationTarget;
  /** Set when `search_knowledge` ran. */
  knowledgeSearch?: boolean;
}

/** Result of {@link prepareToolCall}. */
export type PreparedCall<TUser extends AgentUser> =
  | { status: "ready"; kind: ToolKind; input: unknown; tool?: ResolvedTool<TUser> }
  | { status: "needs-confirmation"; input: unknown; tool: ResolvedTool<TUser>; summary: string }
  | { status: "rejected"; outcome: ToolOutcome };

/** Converts a Zod schema to a JSON Schema object usable as tool parameters. */
export function toParametersSchema(schema: z.ZodType, label: string): JsonSchema {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
  delete json.$schema;
  if (json.type !== "object") {
    throw new SpeeqError("NOT_CONFIGURED", {
      message: `speeq: tool "${label}" input must be a z.object(...) schema.`,
    });
  }
  return json;
}

function navigateSchema(config: ResolvedConfig) {
  const ids = [...config.routes.keys()] as [string, ...string[]];
  return z.object({
    routeId: z.enum(ids).describe("Id of the page to open."),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Route params, if the route has any."),
  });
}

function knowledgeSchema(config: ResolvedConfig) {
  const ids = config.knowledge.map((k) => k.id) as [string, ...string[]];
  return z.object({
    query: z.string().min(1).max(500).describe("What to search for, in the user's words."),
    sourceId: z.enum(ids).optional().describe("Limit the search to one source."),
  });
}

function contextSchema(config: ResolvedConfig) {
  const ids = [...config.contextProviders.keys()] as [string, ...string[]];
  // Strict: the model can name a source, never a user, tenant or record to fetch for.
  return z.object({ source: z.enum(ids).describe("Which source to read.") }).strict();
}

function preferenceSchema(config: ResolvedConfig) {
  const categories = config.memory.categories as [string, ...string[]];
  return z
    .object({
      category: z.enum(categories).describe("Which kind of preference."),
      value: z
        .string()
        .min(1)
        .max(120)
        .describe('The preference in a few words, as the user said it, e.g. "short answers".'),
    })
    .strict();
}

/**
 * The built-in `remember_preference` tool, offered only to signed-in users in `preferences` mode.
 * `null` otherwise. It can save a stated preference of the verified user and nothing else.
 */
export function preferenceToolDefinition(config: ResolvedConfig): LLMToolDefinition | null {
  if (config.memory.mode !== "preferences" || config.memory.categories.length === 0) return null;
  return {
    name: "remember_preference",
    description: `Save a lasting preference the user clearly stated about how they want help (${config.memory.categories.join(", ")}). Only when they say it themselves, e.g. "always answer in Telugu" or "I'm preparing for DBMS". Never for purchases, access, account facts, health, money or anything personal.`,
    parameters: toParametersSchema(preferenceSchema(config), "remember_preference"),
  };
}

/** True when `value` is a plain preference: no email, long number, key or token. */
export function isPlainPreference(value: string): boolean {
  return redactText(value) === value && !value.split(/\s+/).some((w) => looksSecret(w));
}

/** Builds the tool list sent to the model: built-ins first, then developer tools. */
export function buildToolDefinitions(config: ResolvedConfig): LLMToolDefinition[] {
  const defs: LLMToolDefinition[] = [];
  if (config.routes.size > 0) {
    defs.push({
      name: "navigate",
      description:
        "Open a page of this website for the user. Only use route ids from the list in the instructions.",
      parameters: toParametersSchema(navigateSchema(config), "navigate"),
    });
  }
  if (config.knowledge.length > 0) {
    const sources = config.knowledge.map((k) => `${k.id}: ${k.description}`).join("; ");
    defs.push({
      name: "search_knowledge",
      description: `Search this website's content. Sources: ${sources}`,
      parameters: toParametersSchema(knowledgeSchema(config), "search_knowledge"),
    });
  }
  if (config.contextProviders.size > 0) {
    const sources = [...config.contextProviders.values()]
      .map(
        (p) =>
          `${p.def.id}: ${p.def.description.slice(0, 90)}${p.auth === "required" ? " (signed-in users)" : ""}`,
      )
      .join("; ");
    defs.push({
      name: "get_context",
      description: `Read current, authorized data about the signed-in customer or this app. Use it instead of guessing or asking for things a source can tell you. Sources: ${sources}`,
      parameters: toParametersSchema(contextSchema(config), "get_context"),
    });
  }
  for (const { def } of config.tools.values()) {
    const risk = def.risk === "write" ? " (changes data; the user will be asked to confirm)" : "";
    defs.push({
      name: def.name,
      description: def.description + risk,
      parameters: toParametersSchema(def.input, def.name),
    });
  }
  return defs;
}

function rejected(kind: ToolKind, code: ErrorCode, message: string): PreparedCall<never> {
  return {
    status: "rejected",
    outcome: {
      kind,
      ok: false,
      content: errorContent(code, message),
      truncated: false,
      durationMs: 0,
      errorCode: code,
    },
  };
}

/** Error result text the model sees. */
export function errorContent(code: ErrorCode, message: string): string {
  return safeJsonStringify({ error: { code, message } });
}

/**
 * Looks up and validates a tool call. Invalid calls are rejected with a message the model can
 * act on (it may retry with fixed arguments). Write tools return `needs-confirmation`.
 */
export function prepareToolCall<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  call: LLMToolCall,
): PreparedCall<TUser> {
  if (call.name === "navigate" && config.routes.size > 0) {
    const parsed = navigateSchema(config).safeParse(call.arguments);
    if (!parsed.success) return rejected("builtin", "INVALID_INPUT", issues(parsed.error));
    return { status: "ready", kind: "builtin", input: parsed.data };
  }
  if (call.name === "search_knowledge" && config.knowledge.length > 0) {
    const parsed = knowledgeSchema(config).safeParse(call.arguments);
    if (!parsed.success) return rejected("builtin", "INVALID_INPUT", issues(parsed.error));
    return { status: "ready", kind: "builtin", input: parsed.data };
  }
  if (call.name === "get_context" && config.contextProviders.size > 0) {
    const parsed = contextSchema(config).safeParse(call.arguments);
    if (!parsed.success) return rejected("builtin", "INVALID_INPUT", issues(parsed.error));
    return { status: "ready", kind: "builtin", input: parsed.data };
  }
  if (call.name === "remember_preference" && preferenceToolDefinition(config)) {
    const parsed = preferenceSchema(config).safeParse(call.arguments);
    if (!parsed.success) return rejected("builtin", "INVALID_INPUT", issues(parsed.error));
    return { status: "ready", kind: "builtin", input: parsed.data };
  }
  const tool = config.tools.get(call.name);
  if (!tool) return rejected("custom", "INVALID_INPUT", `Unknown tool "${call.name}".`);
  const parsed = (tool.def.input as z.ZodType).safeParse(call.arguments);
  if (!parsed.success) return rejected("custom", "INVALID_INPUT", issues(parsed.error));
  if (tool.needsConfirmation) {
    const summary = safeSummary(tool, parsed.data);
    return { status: "needs-confirmation", input: parsed.data, tool, summary };
  }
  return { status: "ready", kind: "custom", input: parsed.data, tool };
}

function safeSummary(tool: ResolvedTool<AgentUser>, input: unknown): string {
  try {
    const s = tool.def.confirmationSummary?.(input);
    if (s) return truncate(s, 300).text;
  } catch {
    // fall through to the default summary
  }
  return `Run "${tool.def.name}"?`;
}

/** Short, model-readable list of validation problems. */
export function issues(error: z.ZodError): string {
  return `Invalid arguments: ${error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ")}`;
}

/**
 * Runs a prepared tool with a timeout and the turn's abort signal, then serializes and truncates
 * the result. Never throws: failures become an error result for the model.
 */
export async function executeTool<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  name: string,
  prepared: { kind: ToolKind; input: unknown; tool?: ResolvedTool<TUser> },
  ctx: AgentContext<TUser>,
): Promise<ToolOutcome> {
  const started = performance.now();
  const timeoutMs = prepared.tool?.timeoutMs ?? config.raw.guardrails?.toolTimeoutMs ?? 8000;
  const signal = combineSignals([ctx.signal], timeoutMs);
  const elapsed = () => Math.round(performance.now() - started);
  try {
    const value = await raceAbort(runTool(config, name, prepared, { ...ctx, signal }), signal);
    const { text, truncated } = truncate(
      safeJsonStringify(value.result),
      config.maxToolOutputChars,
    );
    const out: ToolOutcome = {
      kind: prepared.kind,
      ok: true,
      content: text,
      truncated,
      durationMs: elapsed(),
    };
    if (value.navigation) out.navigation = value.navigation;
    if (name === "search_knowledge") out.knowledgeSearch = true;
    return out;
  } catch (error) {
    const timedOut = signal.aborted && !ctx.signal.aborted;
    const code: ErrorCode = timedOut
      ? "TOOL_TIMEOUT"
      : isSpeeqError(error)
        ? error.code
        : "TOOL_ERROR";
    const message = timedOut
      ? `The tool took longer than ${timeoutMs} ms and was stopped.`
      : isSpeeqError(error)
        ? error.message
        : "The tool failed.";
    if (!isSpeeqError(error) && !isAbortError(error)) {
      config.logger.error(`tool "${name}" threw`, error);
    }
    return {
      kind: prepared.kind,
      ok: false,
      content: errorContent(code, message),
      truncated: false,
      durationMs: elapsed(),
      errorCode: code,
    };
  }
}

async function runTool<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  name: string,
  prepared: { input: unknown; tool?: ResolvedTool<TUser> },
  ctx: AgentContext<TUser>,
): Promise<{ result: unknown; navigation?: NavigationTarget }> {
  if (prepared.tool) return { result: await prepared.tool.def.handler(prepared.input, ctx) };
  if (name === "navigate") {
    const { routeId, params } = prepared.input as { routeId: string; params?: unknown };
    const navigation = resolveNavigation(config.routes, routeId, params);
    const title = config.routes.get(routeId)?.title ?? routeId;
    return { result: { ok: true, opened: title }, navigation };
  }
  if (name === "search_knowledge") {
    const { query, sourceId } = prepared.input as { query: string; sourceId?: string };
    const sources = config.knowledge.filter((k) => !sourceId || k.id === sourceId);
    const settled = await Promise.allSettled(sources.map((s) => s.search(query, ctx)));
    const results = settled.flatMap((r, i) =>
      r.status === "fulfilled"
        ? r.value.slice(0, 5).map((hit) => ({
            source: sources[i]?.id,
            id: hit.id,
            title: hit.title,
            content: truncate(hit.content, 1200).text,
            href: hit.href,
          }))
        : [],
    );
    for (const r of settled) {
      if (r.status === "rejected") config.logger.error("knowledge source failed", r.reason);
    }
    return { result: { results: results.slice(0, 8) } };
  }
  if (name === "get_context") {
    const { source } = prepared.input as { source: string };
    const provider = config.contextProviders.get(source);
    if (!provider)
      throw new SpeeqError("INVALID_INPUT", { message: `Unknown source "${source}".` });
    return { result: await loadContext(config, provider, ctx) };
  }
  if (name === "remember_preference") {
    const store = config.raw.store;
    // The scope is the verified user of this request; the model cannot name anyone else.
    if (!ctx.user || !store.setPreference)
      throw new SpeeqError("FORBIDDEN", { message: "Only signed-in users can save preferences." });
    const { category, value } = prepared.input as { category: string; value: string };
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean || !isPlainPreference(clean))
      throw new SpeeqError("INVALID_INPUT", {
        message: "Not saved: preferences cannot contain contact details, numbers, keys or tokens.",
      });
    const expiresAt = new Date(
      Date.now() + config.memory.preferenceDays * 86_400_000,
    ).toISOString();
    await store.setPreference(memoryScope(ctx.user), category, clean, expiresAt);
    return { result: { ok: true, saved: { category, value: clean } } };
  }
  throw new SpeeqError("INVALID_INPUT", { message: `Unknown tool "${name}".` });
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

import { type AgentContext, type AgentUser, combineSignals, SpeeqError } from "@speeq/core";
import type { z } from "zod";
import type { ResolvedConfig } from "../resolve.js";
import type { ContextCategory, ContextProviderDefinition } from "./define.js";
import { bound, type exposeTree, project } from "./project.js";

/** A provider after defaults are applied. Internal. */
export interface ResolvedProvider<TUser extends AgentUser = AgentUser> {
  def: ContextProviderDefinition<z.ZodType, TUser>;
  auth: "required" | "optional";
  load: "initial" | "on-demand";
  tree: ReturnType<typeof exposeTree>;
  maxItems: number;
  maxChars: number;
  timeoutMs: number;
}

/** Limits per HTTP request (one user message or one resume). */
export interface ContextBudget {
  maxInitial: number;
  maxCalls: number;
  maxChars: number;
}

/** What the model sees from one source. */
export interface ContextData {
  source: string;
  category: ContextCategory;
  data: unknown;
  truncated?: true;
}

interface RequestState {
  results: Map<string, Promise<ContextData>>;
  calls: number;
  chars: number;
}

// Keyed by the incoming Request: results live exactly as long as the request, never across users.
const states = new WeakMap<Request, RequestState>();

function stateFor(request: Request): RequestState {
  let s = states.get(request);
  if (!s) {
    s = { results: new Map(), calls: 0, chars: 0 };
    states.set(request, s);
  }
  return s;
}

/**
 * Fetches one source for this request through the full pipeline: sign-in check, budget, timeout,
 * output schema, projection to `expose`, screening and size limits. Cached for the request. Throws
 * a `SpeeqError` whose message the model may read; never a raw error or the fetched data.
 */
export function loadContext<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  provider: ResolvedProvider<TUser>,
  ctx: AgentContext<TUser>,
): Promise<ContextData> {
  const state = stateFor(ctx.request);
  const cached = state.results.get(provider.def.id);
  if (cached) return cached;
  if (provider.auth === "required" && !ctx.user)
    return Promise.reject(
      new SpeeqError("UNAUTHENTICATED", {
        message: "The visitor is not signed in. Ask them to sign in to see this.",
      }),
    );
  if (state.calls >= config.contextBudget.maxCalls)
    return Promise.reject(
      new SpeeqError("RATE_LIMITED", {
        message: "No more data can be fetched for this message. Answer with what you have.",
        retryable: false,
      }),
    );
  state.calls++;
  const result = run(config, provider, ctx, state);
  state.results.set(provider.def.id, result);
  return result;
}

async function run<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  provider: ResolvedProvider<TUser>,
  ctx: AgentContext<TUser>,
  state: RequestState,
): Promise<ContextData> {
  const { def } = provider;
  const signal = combineSignals([ctx.signal], provider.timeoutMs);
  let raw: unknown;
  try {
    raw = await new Promise<unknown>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve()
        .then(() => def.fetch({ ...ctx, signal }))
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", onAbort));
    });
  } catch (error) {
    if (signal.aborted && !ctx.signal.aborted)
      throw new SpeeqError("TOOL_TIMEOUT", { message: "That information took too long to load." });
    if (ctx.signal.aborted) throw error;
    // A deliberate refusal from the app keeps its public code and message.
    if (error instanceof SpeeqError && ["FORBIDDEN", "NOT_FOUND"].includes(error.code)) throw error;
    config.logger.error(`context source "${def.id}" failed`, error);
    throw new SpeeqError("TOOL_ERROR", { message: "That information is unavailable right now." });
  }
  const parsed = def.output.safeParse(raw);
  if (!parsed.success) {
    config.logger.error(
      `context source "${def.id}" returned data that does not match its output schema`,
    );
    throw new SpeeqError("TOOL_ERROR", { message: "That information is unavailable right now." });
  }
  const { value } = project(parsed.data, provider.tree, def.sensitive);
  const room = Math.min(provider.maxChars, config.contextBudget.maxChars - state.chars);
  if (room <= 50)
    throw new SpeeqError("RATE_LIMITED", {
      message: "No more data fits for this message. Answer with what you have.",
      retryable: false,
    });
  const limited = bound(value, provider.maxItems, room);
  state.chars += limited.text.length;
  return {
    source: def.id,
    category: def.category,
    data: limited.value,
    ...(limited.truncated ? { truncated: true as const } : {}),
  };
}

/**
 * Loads the `initial` sources for this request (at most `budget.maxInitial`, in parallel). Sources
 * that need sign-in are skipped for visitors; failures are left out, never fatal.
 */
export async function loadInitialContext<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  ctx: AgentContext<TUser>,
): Promise<ContextData[]> {
  const eligible = [...config.contextProviders.values()]
    .filter((p) => p.load === "initial" && (p.auth === "optional" || ctx.user))
    .slice(0, config.contextBudget.maxInitial);
  const settled = await Promise.allSettled(eligible.map((p) => loadContext(config, p, ctx)));
  return settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

/** What the store keeps instead of fetched data: history never holds customer context. */
export function contextPlaceholder(source: unknown): string {
  return JSON.stringify({
    source: typeof source === "string" ? source : "unknown",
    note: "Retrieved earlier and not stored. Fetch again for current data.",
  });
}

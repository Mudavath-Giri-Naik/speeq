import type { AgentContext, AgentUser, ClientGreeting, PageContext } from "@speeq/core";
import type { StarterDefinition } from "./config.js";
import { loadContext } from "./context/run.js";
import { cleanProfileValue, exposedProfile } from "./handler/identity.js";
import type { ResolvedConfig } from "./resolve.js";

/** Which greeting list applies. */
export type GreetingState = "guest" | "member" | "returning";

const PLACEHOLDER = /\{([a-z][a-z0-9_]*(?:\.[A-Za-z_][\w]*)?)\}/g;
const MAX_STARTERS = 4;

/** Matches a concrete path such as `/courses/os?x=1` to a route id (`/courses/:slug`). */
export function routeIdForPath(
  config: ResolvedConfig,
  path: string | undefined,
): string | undefined {
  if (!path) return undefined;
  const clean = (path.split(/[?#]/)[0] ?? "/").replace(/\/+$/, "") || "/";
  const parts = clean.split("/");
  for (const route of config.routes.values()) {
    const pattern = (route.path.replace(/\/+$/, "") || "/").split("/");
    if (pattern.length !== parts.length) continue;
    if (pattern.every((seg, i) => seg.startsWith(":") || seg === parts[i])) return route.id;
  }
  return undefined;
}

/** Capability ids a starter may require. */
export function capabilityIds(config: ResolvedConfig): Set<string> {
  const ids = new Set<string>([
    ...config.routes.keys(),
    ...config.tools.keys(),
    ...config.uiActions.keys(),
    ...config.contextProviders.keys(),
  ]);
  for (const p of config.contextProviders.values()) ids.add(`category:${p.def.category}`);
  if (config.routes.size > 0) ids.add("navigation");
  if (config.knowledge.length > 0) ids.add("knowledge");
  return ids;
}

/** Starters for this visitor and page: conditions hold and every required capability exists. */
export function selectStarters(
  config: ResolvedConfig,
  starters: readonly StarterDefinition[],
  signedIn: boolean,
  routeId: string | undefined,
): { label: string; prompt: string }[] {
  const caps = capabilityIds(config);
  const out: { label: string; prompt: string }[] = [];
  for (const s of starters) {
    const label = cleanProfileValue(s.label, 60);
    if (!label) continue;
    const when = s.when ?? {};
    if (when.auth === "guest" && signedIn) continue;
    if (when.auth === "member" && !signedIn) continue;
    if (when.routes?.length && (!routeId || !when.routes.includes(routeId))) continue;
    if (when.requires?.some((id) => !caps.has(id))) continue;
    out.push({ label, prompt: cleanProfileValue(s.prompt ?? s.label, 300) ?? label });
    if (out.length === MAX_STARTERS) break;
  }
  return out;
}

/** Inputs for {@link buildGreeting}. */
export interface GreetingInput<TUser extends AgentUser> {
  request: Request;
  user: TUser | null;
  /** The current session, excluded when deciding whether the user is returning. */
  sessionId?: string;
  path?: string;
  language: string;
}

async function isReturning<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  user: TUser,
  sessionId: string | undefined,
): Promise<boolean> {
  try {
    const page = await config.raw.store.listSessions({
      userId: user.id,
      ...(user.tenantId ? { tenantId: user.tenantId } : {}),
      limit: 2,
    });
    return page.sessions.some(
      (s) => s.id !== sessionId && (s.tenantId ?? null) === (user.tenantId ?? null),
    );
  } catch {
    return false; // a store hiccup only loses the "welcome back"
  }
}

/**
 * The greeting and starters for one visitor, chosen deterministically from configured templates
 * and real, approved values. No model call. `undefined` when the app configures neither.
 */
export async function buildGreeting<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  input: GreetingInput<TUser>,
): Promise<ClientGreeting | undefined> {
  const g = config.raw.greeting;
  const starters = config.raw.starters ?? [];
  if ((!g || g.enabled === false) && starters.length === 0) return undefined;
  const signedIn = input.user !== null;
  const routeId = routeIdForPath(config as ResolvedConfig, input.path);
  const state: GreetingState = !input.user
    ? "guest"
    : (g?.returning?.length ?? 0) > 0 && (await isReturning(config, input.user, input.sessionId))
      ? "returning"
      : "member";
  const text = g && g.enabled !== false ? await pickText(config, input, state, routeId) : "";
  return {
    text,
    starters:
      g?.showStarters === false
        ? []
        : selectStarters(config as ResolvedConfig, starters, signedIn, routeId),
    frequency: g?.frequency ?? "once-per-session",
    delayMs: Math.max(0, Math.min(g?.delayMs ?? 600, 10_000)),
  };
}

async function pickText<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  input: GreetingInput<TUser>,
  state: GreetingState,
  routeId: string | undefined,
): Promise<string> {
  const g = config.raw.greeting ?? {};
  const byState: Record<GreetingState, (string[] | undefined)[]> = {
    guest: [g.guest],
    member: [g.member, g.guest],
    returning: [g.returning, g.member, g.guest],
  };
  const candidates = [
    ...(routeId ? (g.pages?.[routeId] ?? []) : []),
    ...byState[state].flatMap((list) => list ?? []),
  ];
  const values = new Map<string, string | null>();
  for (const template of candidates) {
    const filled = await fill(config, input, template, values);
    if (filled) return filled;
  }
  return "";
}

async function fill<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  input: GreetingInput<TUser>,
  template: string,
  cache: Map<string, string | null>,
): Promise<string | undefined> {
  const keys = [...template.matchAll(PLACEHOLDER)].map((m) => m[1] as string);
  for (const key of keys) {
    if (!cache.has(key)) cache.set(key, await placeholderValue(config, input, key));
    if (cache.get(key) == null) return undefined;
  }
  const text = template.replace(PLACEHOLDER, (_m, key: string) => cache.get(key) ?? "");
  return cleanProfileValue(text, 300);
}

async function placeholderValue<TUser extends AgentUser>(
  config: ResolvedConfig<TUser>,
  input: GreetingInput<TUser>,
  key: string,
): Promise<string | null> {
  const raw = config.raw;
  if (key === "agent") return config.agentName;
  if (key === "business") return cleanProfileValue(raw.business?.name, 60) ?? null;
  if (key === "name") {
    if (raw.agent.style?.nameUsage === "never") return null;
    const p = exposedProfile(config as ResolvedConfig, input.user);
    return p?.preferredName ?? p?.displayName ?? null;
  }
  const [sourceId, field] = key.split(".");
  if (!sourceId || !field || raw.business?.sensitive) return null;
  const provider = config.contextProviders.get(sourceId);
  if (!provider?.def.greeting?.includes(field)) return null;
  const ctx: AgentContext<TUser> = {
    user: input.user,
    session: { id: input.sessionId ?? "greeting" },
    request: input.request,
    signal: input.request.signal,
    language: input.language,
    pageContext: input.path ? ({ path: input.path } satisfies PageContext) : undefined,
  };
  try {
    const result = await loadContext(config, provider, ctx);
    const value = (result.data as Record<string, unknown> | undefined)?.[field];
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string") return cleanProfileValue(value, 60) ?? null;
    return null;
  } catch {
    return null;
  }
}

import {
  type AgentUser,
  type IdentityResponse,
  type IdentitySummary,
  PROTOCOL_VERSION,
} from "@speeq/core";
import type { ResolvedConfig } from "../resolve.js";
import type { Runtime } from "../runtime.js";
import { identityFingerprint } from "../security/token.js";
import { json } from "./http.js";

/** Profile fields that may leave the server, in the order they are copied. */
export const EXPOSABLE_PROFILE_FIELDS = ["displayName", "preferredName", "locale"] as const;
/** A profile field the developer may expose to the browser and the model. */
export type ExposableProfileField = (typeof EXPOSABLE_PROFILE_FIELDS)[number];

// Control characters and line separators, which could fake new lines in prompts or logs.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** Trim, drop control characters and cut a profile value; `undefined` if nothing is left. */
export function cleanProfileValue(value: unknown, max = 80): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return text || undefined;
}

/** The exposed profile fields of `user`, cleaned. `undefined` when none is exposed or set. */
export function exposedProfile(
  config: ResolvedConfig,
  user: AgentUser | null,
): IdentitySummary["profile"] {
  if (!user?.profile || config.identityExpose.length === 0) return undefined;
  const out: NonNullable<IdentitySummary["profile"]> = {};
  for (const field of config.identityExpose) {
    const value = cleanProfileValue(user.profile[field], field === "locale" ? 35 : 80);
    if (value !== undefined) out[field] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** What the browser may know about who is talking. Never contains a user or tenant id. */
export async function identitySummary(
  config: ResolvedConfig,
  user: AgentUser | null,
): Promise<IdentitySummary> {
  const profile = exposedProfile(config, user);
  return {
    state: user ? "authenticated" : "anonymous",
    fingerprint: await identityFingerprint(user, config.secret),
    ...(profile ? { profile } : {}),
  };
}

/**
 * `GET /identity`: who the host app's session says is signed in, from cookies only. Never creates
 * a session and never writes to the store. Rate-limited like session creation.
 */
export async function handleIdentity<TUser extends AgentUser>(
  rt: Runtime<TUser>,
  request: Request,
  headers: Record<string, string>,
): Promise<Response> {
  const { user } = await rt.lookupUser(request);
  rt.limitIdentity(request, user?.id ?? null);
  const body: IdentityResponse = {
    protocolVersion: PROTOCOL_VERSION,
    identity: await identitySummary(rt.config as ResolvedConfig, user),
  };
  return json(body, 200, { ...headers, "cache-control": "no-store" });
}

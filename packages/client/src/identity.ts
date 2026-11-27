import type { ClientGreeting, IdentitySummary } from "@speeq/core";

/** Minimum time between automatic identity checks (focus, visibility). */
export const PROBE_THROTTLE_MS = 5000;

/** True for a well-formed identity summary from the server. */
export function validIdentity(value: unknown): value is IdentitySummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.state !== "anonymous" && v.state !== "authenticated") return false;
  if (typeof v.fingerprint !== "string" || !v.fingerprint || v.fingerprint.length > 32)
    return false;
  if (v.profile === undefined) return true;
  if (typeof v.profile !== "object" || v.profile === null) return false;
  return Object.entries(v.profile).every(
    ([k, x]) => ["displayName", "preferredName", "locale"].includes(k) && typeof x === "string",
  );
}

/** True for a well-formed greeting from the server. */
export function validGreeting(value: unknown): value is ClientGreeting {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.text === "string" &&
    Array.isArray(v.starters) &&
    v.starters.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as { label?: unknown }).label === "string" &&
        typeof (s as { prompt?: unknown }).prompt === "string",
    ) &&
    (v.frequency === "once-per-session" || v.frequency === "every-open") &&
    typeof v.delayMs === "number"
  );
}

/**
 * Asks the server who is signed in (`GET {endpoint}/identity`, cookies only). Returns `null` when the
 * server is older than 0.12, unreachable, rate limited or answers anything unexpected: a failed check
 * never resets a conversation.
 */
export async function fetchIdentity(
  fetcher: typeof fetch,
  endpoint: string,
  path?: string,
): Promise<{ identity: IdentitySummary; greeting: ClientGreeting | null } | null> {
  try {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await fetcher(`${endpoint}/identity${query}`, {
      method: "GET",
      headers: { accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { identity?: unknown; greeting?: unknown } | null;
    if (!validIdentity(body?.identity)) return null;
    return {
      identity: body.identity,
      greeting: validGreeting(body.greeting) ? body.greeting : null,
    };
  } catch {
    return null;
  }
}

/**
 * Calls `check` when the page becomes visible or the window gets focus, at most once per
 * {@link PROBE_THROTTLE_MS}. No timers, no polling. Returns a function that removes the listeners.
 */
export function watchIdentity(check: () => void, now: () => number = Date.now): () => void {
  // Only real event targets: test or server environments may stub these globals partially.
  const target = <T>(value: T | undefined) =>
    typeof (value as { addEventListener?: unknown } | undefined)?.addEventListener === "function"
      ? value
      : undefined;
  const doc = target(typeof document !== "undefined" ? document : undefined);
  const win = target(typeof window !== "undefined" ? window : undefined);
  if (!doc && !win) return () => {};
  let last = Number.NEGATIVE_INFINITY;
  const run = () => {
    if (doc && doc.visibilityState === "hidden") return;
    const t = now();
    if (t - last < PROBE_THROTTLE_MS) return;
    last = t;
    check();
  };
  doc?.addEventListener("visibilitychange", run);
  win?.addEventListener("focus", run);
  return () => {
    doc?.removeEventListener("visibilitychange", run);
    win?.removeEventListener("focus", run);
  };
}

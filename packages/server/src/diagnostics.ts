import { type ErrorReason, isSpeeqError, looksSecret, redactText } from "@speeq/core";
import type { SpeeqLogger } from "./config.js";

/** What a developer should do about each reason. Shown in development logs only. */
export const REASON_ACTIONS: Readonly<Record<ErrorReason, string>> = {
  invalid_key: "Check the API key in .env.local (run `npx speeq setup` to test it).",
  not_configured: "Finish the provider setup with `npx speeq setup`.",
  rate_limited: "Wait a little, lower traffic, or configure another approved provider.",
  busy: "The provider is overloaded. Retry later or switch models.",
  quota_exhausted:
    "The free-tier quota is used up. Wait for the reset or use another key or model.",
  model_unavailable: "The model id is wrong or retired. Pick a working one with `npx speeq setup`.",
  unsupported_language:
    "Enable the language in agent.languages or choose a provider that supports it.",
  network: "The server could not reach the provider. Check the network, proxy or base URL.",
  timeout: "The provider timed out. Retry, or use a faster model.",
  speech_unavailable: "Check the speech provider keys and the speech.policy settings.",
  storage_unavailable: "Check the conversation store (for MongoDB, the URI and network access).",
  auth_required: "This needs a signed-in user; check resolveUser.",
  context_unavailable: "A context source failed; see the error logged above.",
};

function isProduction(): boolean {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.NODE_ENV === "production";
}

/** Removes anything that looks like a key, token, email or long number from a provider body. */
export function scrubBody(body: string, max = 200): string {
  return redactText(body)
    .split(/(\s+)/)
    .map((w) => (looksSecret(w.replace(/[",{}:]/g, "")) ? "[REDACTED]" : w))
    .join("")
    .replace(/(bearer|api[-_ ]?key|authorization)\s*[:=]?\s*(bearer\s+)?\S+/gi, "$1 [REDACTED]")
    .slice(0, max);
}

/**
 * In development, prints one line a developer can act on for a provider failure:
 * `Model provider groq: status 429, reason rate_limited, retry in 5000 ms. Suggested action: …`.
 * Never prints keys, headers, prompts or customer data. Silent in production and for other errors.
 */
export function logProviderDiagnostic(logger: SpeeqLogger, error: unknown): void {
  if (isProduction() || !isSpeeqError(error)) return;
  const d = error.details as
    | { provider?: unknown; status?: unknown; body?: unknown; network?: unknown }
    | undefined;
  if (typeof d?.provider !== "string") return;
  const parts = [`Model provider ${d.provider}:`];
  if (typeof d.status === "number") parts.push(`status ${d.status},`);
  parts.push(`reason ${error.reason ?? error.code}`);
  if (error.retryAfterMs !== undefined) parts.push(`, retry in ${error.retryAfterMs} ms`);
  let line = `${parts.join(" ")}.`.replace(" ,", ",");
  if (error.reason) line += ` Suggested action: ${REASON_ACTIONS[error.reason]}`;
  if (typeof d.body === "string" && d.body.trim()) line += ` Provider said: ${scrubBody(d.body)}`;
  logger.warn(line);
}

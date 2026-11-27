import { isAbortError, SpeeqError } from "../errors.js";
import { SseParser } from "./sse.js";

/**
 * Reads the `data:` payloads of an SSE response body. For LLM adapters: stops at `[DONE]`
 * and honors `signal`.
 */
export async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      const messages = done ? parser.end() : parser.push(decoder.decode(value, { stream: true }));
      for (const m of messages) {
        if (m.data === "[DONE]") return;
        yield m.data;
      }
      if (done) return;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

/** Parses a `Retry-After` header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

const EXHAUSTED_RE = /quota|exhausted|per day|billing|insufficient|credits?/i;
const MODEL_RE = /model.{0,40}(not found|does not exist|decommissioned|not supported|unavailable)/i;
const BUSY_RE = /overloaded|capacity|temporarily unavailable|try again later/i;
const QUOTA_RE = /rate.?limit|quota|resource.?exhausted|too many requests|tokens per (minute|day)/i;

/**
 * Maps an HTTP error from an LLM provider to a {@link SpeeqError}:
 * 429 and quota or rate-limit bodies → `RATE_LIMITED` (with a retry hint), 401/403 →
 * `NOT_CONFIGURED` (bad API key), anything else → `PROVIDER_ERROR`. The provider's raw message
 * is kept in `details` for server logs, never in the public message.
 */
export function mapProviderHttpError(
  provider: string,
  status: number,
  bodyText: string,
  retryAfter?: string | null,
): SpeeqError {
  const details = { provider, status, body: bodyText.slice(0, 1000) };
  if (status === 429 || QUOTA_RE.test(bodyText)) {
    const reason = EXHAUSTED_RE.test(bodyText) ? "quota_exhausted" : "rate_limited";
    return new SpeeqError("RATE_LIMITED", {
      retryAfterMs: parseRetryAfter(retryAfter) ?? 5000,
      reason,
      details: { ...details, reason },
    });
  }
  if (status === 401 || status === 403) {
    return new SpeeqError("NOT_CONFIGURED", {
      reason: "invalid_key",
      details: { ...details, reason: "invalid_key" },
    });
  }
  const reason =
    status === 404 || MODEL_RE.test(bodyText)
      ? "model_unavailable"
      : status === 408 || status === 504
        ? "timeout"
        : status >= 500 || BUSY_RE.test(bodyText)
          ? "busy"
          : undefined;
  return new SpeeqError("PROVIDER_ERROR", {
    retryable: status >= 500 || status === 408,
    ...(reason ? { reason } : {}),
    details: { ...details, ...(reason ? { reason } : {}) },
  });
}

/** Wraps `fetch` so network failures become `PROVIDER_ERROR` and aborts are rethrown as-is. */
export async function providerFetch(
  provider: string,
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new SpeeqError("PROVIDER_ERROR", {
      cause: error,
      reason: "network",
      details: { provider, network: true, reason: "network" },
    });
  }
}

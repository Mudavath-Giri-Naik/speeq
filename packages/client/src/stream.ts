import type { ProtocolEvent } from "@speeq/core";
import { isErrorCode, type PublicError, SpeeqError } from "@speeq/core/errors";
import { SseParser } from "@speeq/core/utils";

/** Retains the HTTP status for the session refresh decision. */
export class RequestError extends SpeeqError {
  constructor(
    readonly httpStatus: number,
    error: PublicError,
  ) {
    super(error.code, error);
  }
}

/** Posts JSON and maps transport failures to public errors. */
export async function post(
  fetcher: typeof fetch,
  url: string,
  body: unknown,
  signal: AbortSignal,
  token?: string,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
    headers.accept = "text/event-stream";
  }
  const init = { method: "POST", headers, body: JSON.stringify(body), signal };
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw new SpeeqError("INTERNAL", {
      message: "Could not reach the assistant. Check your connection.",
      retryable: true,
    });
  }
  if (response.ok) return response;
  const error = (await response.json().catch(() => null))?.error;
  if (
    isErrorCode(error?.code) &&
    typeof error.message === "string" &&
    typeof error.retryable === "boolean"
  ) {
    throw new RequestError(response.status, error);
  }
  throw new SpeeqError("INTERNAL", { retryable: true });
}

const known = new Set<string>([
  "turn.started",
  "assistant.delta",
  "assistant.message",
  "tool.started",
  "tool.finished",
  "navigate",
  "confirmation.required",
  "error",
  "turn.finished",
] satisfies ProtocolEvent["type"][]);

function parse(data: string): ProtocolEvent | undefined {
  try {
    const value = JSON.parse(data);
    if (value && typeof value === "object" && value.protocolVersion === 1 && known.has(value.type))
      return value;
  } catch {
    /* Ignore malformed frames. */
  }
  return undefined;
}

/** Decodes incremental UTF-8 and releases the reader on completion or cancellation. */
export async function* readEvents(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<ProtocolEvent> {
  const reader = response.body?.getReader();
  const interrupted = () =>
    new SpeeqError("INTERNAL", { message: "The connection was interrupted.", retryable: true });
  if (!reader) throw interrupted();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel);
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      const frames = parser.push(decoder.decode(value, { stream: !done }));
      if (done) frames.push(...parser.end());
      for (const frame of frames) {
        if (signal.aborted) return;
        const event = parse(frame.data);
        if (event) yield event;
        if (event?.type === "turn.finished") return;
      }
      if (done) break;
    }
  } catch {
    throw interrupted();
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
  if (!signal.aborted) throw interrupted();
}

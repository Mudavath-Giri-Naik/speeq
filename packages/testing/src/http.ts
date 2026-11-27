import { type ProtocolEvent, ProtocolEventSchema, SseParser } from "@speeq/core";

/** A web-standard request handler, such as the one returned by `createSpeeq()`. */
export type FetchHandler = (request: Request) => Promise<Response>;

/** Options for {@link jsonRequest}. */
export interface JsonRequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

/** Builds a JSON `Request` for `http://localhost{path}`. */
export function jsonRequest(path: string, options: JsonRequestOptions = {}): Request {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.token) headers.set("authorization", `Bearer ${options.token}`);
  const init: RequestInit = {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  return new Request(`http://localhost${path}`, init);
}

/**
 * Reads an SSE `Response` to the end and returns every protocol event, validated against
 * `ProtocolEventSchema` (an invalid event fails the test).
 */
export async function readSseEvents(response: Response): Promise<ProtocolEvent[]> {
  if (!response.body) return [];
  const parser = new SseParser();
  const decoder = new TextDecoder();
  const events: ProtocolEvent[] = [];
  const reader = response.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    const messages = done ? parser.end() : parser.push(decoder.decode(value, { stream: true }));
    for (const m of messages) events.push(ProtocolEventSchema.parse(JSON.parse(m.data)));
    if (done) break;
  }
  return events;
}

/** Convenience: the concatenated `assistant.message` texts of a list of events. */
export function assistantText(events: ProtocolEvent[]): string {
  return events
    .filter((e) => e.type === "assistant.message")
    .map((e) => (e.type === "assistant.message" ? e.text : ""))
    .join(" ");
}

/** Session handle returned by {@link startSession}. */
export interface TestSession {
  sessionId: string;
  token: string;
  /** Sends a turn and returns all streamed events. */
  turn(
    text: string,
    extra?: { language?: string; context?: unknown; headers?: Record<string, string> },
  ): Promise<ProtocolEvent[]>;
  /** Answers a confirmation and returns all streamed events. */
  confirm(
    confirmationId: string,
    approved: boolean,
    headers?: Record<string, string>,
  ): Promise<ProtocolEvent[]>;
  /** Reports the outcome of a UI action and returns all streamed events. */
  uiResult(
    callId: string,
    status: "done" | "declined" | "failed" | "unavailable",
    result?: unknown,
    headers?: Record<string, string>,
  ): Promise<ProtocolEvent[]>;
}

/**
 * Starts a session against `handler` (mounted at `basePath`) and returns helpers to send turns.
 * Throws if session creation fails.
 */
export async function startSession(
  handler: FetchHandler,
  options: {
    basePath?: string;
    language?: string;
    headers?: Record<string, string>;
    /** Protocol features the simulated client declares, e.g. `["ui-actions"]`. */
    capabilities?: string[];
  } = {},
): Promise<TestSession> {
  const base = options.basePath ?? "/api/speeq";
  const language = options.language ?? "en-IN";
  const res = await handler(
    jsonRequest(`${base}/session`, {
      body: { language, ...(options.capabilities ? { capabilities: options.capabilities } : {}) },
      headers: options.headers ?? {},
    }),
  );
  if (!res.ok) throw new Error(`session failed: ${res.status} ${await res.text()}`);
  const { sessionId, sessionToken } = (await res.json()) as {
    sessionId: string;
    sessionToken: string;
  };
  return {
    sessionId,
    token: sessionToken,
    async turn(text, extra = {}) {
      const body = { text, language: extra.language ?? language, context: extra.context };
      const r = await handler(
        jsonRequest(`${base}/session/${sessionId}/turn`, {
          body,
          token: sessionToken,
          headers: { ...options.headers, ...extra.headers },
        }),
      );
      return readSseEvents(r);
    },
    async confirm(confirmationId, approved, headers) {
      const r = await handler(
        jsonRequest(`${base}/session/${sessionId}/confirm`, {
          body: { confirmationId, approved },
          token: sessionToken,
          headers: { ...options.headers, ...headers },
        }),
      );
      return readSseEvents(r);
    },
    async uiResult(callId, status, result, headers) {
      const r = await handler(
        jsonRequest(`${base}/session/${sessionId}/ui-result`, {
          body: { callId, status, ...(result !== undefined ? { result } : {}) },
          token: sessionToken,
          headers: { ...options.headers, ...headers },
        }),
      );
      return readSseEvents(r);
    },
  };
}

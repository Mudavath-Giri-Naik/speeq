import {
  encodeSse,
  PROTOCOL_VERSION,
  type ProtocolEvent,
  type ProtocolEventInput,
} from "@speeq/core";

/** Pushes protocol events into an SSE stream. */
export type Emit = (event: ProtocolEventInput) => void;

/** Options for {@link sseResponse}. */
export interface SseOptions {
  turnId: string;
  headers?: Record<string, string>;
  /** Aborted when the client disconnects or cancels the stream. */
  controller: AbortController;
  /** Runs after the last event is written and before the stream closes (e.g. telemetry flush). */
  beforeClose?: () => Promise<void> | null;
}

/**
 * Creates a streaming SSE `Response` and runs `run(emit)` to produce events. One request per
 * turn: the stream closes when `run` settles. Writes after close are ignored.
 */
export function sseResponse(run: (emit: Emit) => Promise<void>, options: SseOptions): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const emit: Emit = (event) => {
        if (closed) return;
        const full = {
          protocolVersion: PROTOCOL_VERSION,
          turnId: options.turnId,
          ...event,
        } as ProtocolEvent;
        try {
          ctrl.enqueue(encoder.encode(encodeSse(full.type, JSON.stringify(full))));
        } catch {
          closed = true;
        }
      };
      void (async () => {
        try {
          await run(emit);
          await options.beforeClose?.();
        } finally {
          if (!closed) {
            closed = true;
            try {
              ctrl.close();
            } catch {
              // already closed by the consumer
            }
          }
        }
      })();
    },
    cancel() {
      closed = true;
      options.controller.abort();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...options.headers,
    },
  });
}

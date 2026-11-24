import type { ErrorCode, InputMode, ToolKind } from "@speeq/core";

/** Counters the runtime reports. Implementations must be cheap, synchronous and never throw. */
export interface TelemetrySink {
  session(): void;
  turn(info: {
    language: string;
    inputMode: InputMode;
    latencyMs: number;
    firstTokenMs?: number;
  }): void;
  toolCall(kind: ToolKind): void;
  navigation(): void;
  knowledgeSearch(): void;
  confirmation(outcome: "requested" | "approved" | "rejected"): void;
  error(code: ErrorCode): void;
  /**
   * Returns a promise that sends pending data if a send is due, or `null` if nothing is due.
   * The promise never rejects and settles within the transport timeout.
   */
  flushIfDue(): Promise<void> | null;
}

/** A sink that records nothing (telemetry disabled). */
export const noopTelemetry: TelemetrySink = {
  session: () => undefined,
  turn: () => undefined,
  toolCall: () => undefined,
  navigation: () => undefined,
  knowledgeSearch: () => undefined,
  confirmation: () => undefined,
  error: () => undefined,
  flushIfDue: () => null,
};

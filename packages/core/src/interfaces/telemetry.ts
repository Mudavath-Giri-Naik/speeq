import type { TelemetryBatch } from "../schemas/telemetry.js";

/**
 * Delivers anonymous telemetry batches. Implementations must never throw into the caller's code
 * path; `@speeq/server` also wraps every call defensively.
 */
export interface TelemetryTransport {
  send(batch: TelemetryBatch, options: { signal: AbortSignal }): Promise<void>;
}

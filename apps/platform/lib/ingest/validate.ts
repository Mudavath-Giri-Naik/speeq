import { type TelemetryBatch, TelemetryBatchSchema } from "@speeq/core";
import { MAX_INGEST_BYTES } from "./read-body";
/** Public input rejection, without request details. */
export type IngestFailure = { ok: false; status: 400 | 413 | 415; code: "INVALID_INPUT" };
const invalid = (status: IngestFailure["status"]): IngestFailure => ({
  ok: false,
  status,
  code: "INVALID_INPUT",
});
/** Checks the accepted content type before reading any bytes. */
export function acceptsJson(type: string | null) {
  return type?.toLowerCase().startsWith("application/json") ?? false;
}
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
/** Validates a bounded JSON payload and the ingest time and event rules. */
export function validateIngest(
  contentType: string | null,
  body: string,
  now: Date,
): IngestFailure | { ok: true; batch: TelemetryBatch } {
  if (!acceptsJson(contentType)) return invalid(415);
  if (new TextEncoder().encode(body).length > MAX_INGEST_BYTES) return invalid(413);
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return invalid(400);
  }
  const result = TelemetryBatchSchema.safeParse(data);
  if (!result.success) return invalid(400);
  const batch = result.data,
    day = 86400000,
    latest = now.getTime() + 300000,
    sent = Date.parse(batch.sentAt);
  if (sent < now.getTime() - day || sent > latest) return invalid(400);
  const types = new Set<string>();
  for (const event of batch.events) {
    const ts = Date.parse(event.ts);
    if (ts < now.getTime() - 7 * day || ts > latest) return invalid(400);
    if (event.type !== "sdk.init") {
      const start = Date.parse(event.periodStart),
        end = Date.parse(event.periodEnd);
      if (start > end || end > latest || end - start > 7 * day) return invalid(400);
    }
    if (types.has(event.type)) return invalid(400);
    types.add(event.type);
    if (event.type === "usage.rollup") {
      const c = event.counters;
      if (
        c.voiceTurns + c.textTurns !== c.turns ||
        sum(Object.values(c.languages)) > c.turns ||
        sum(c.latencyMs.total) > c.turns ||
        sum(c.latencyMs.firstToken) > c.turns
      )
        return invalid(400);
    }
  }
  return { ok: true, batch };
}

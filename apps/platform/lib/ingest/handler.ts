import type { Db } from "../../db/client";
import { persist } from "./persist";
import { readBoundedBody } from "./read-body";
import { checkThrottle } from "./throttle";
import { acceptsJson, validateIngest } from "./validate";

function failure(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store", ...headers } },
  );
}
/** Responds to unsupported methods, including Next's automatic OPTIONS. */
export function methodDenied() {
  return failure(405, "INVALID_INPUT", "Method unavailable.", { allow: "POST" });
}
/** Enforces ingestion checks in order and opens the database after validation. */
export async function handleIngest(
  request: Request,
  deps: { db: Db | (() => Promise<Db>); now: () => Date },
) {
  try {
    if (request.method !== "POST") return methodDenied();
    const type = request.headers.get("content-type");
    if (!acceptsJson(type)) return failure(415, "INVALID_INPUT", "Unsupported media type.");
    const body = await readBoundedBody(request);
    if (!body.ok) return failure(body.status, "INVALID_INPUT", "Request rejected.");
    const now = deps.now(),
      parsed = validateIngest(type, body.text, now);
    if (!parsed.ok) return failure(parsed.status, parsed.code, "Request rejected.");
    const db = typeof deps.db === "function" ? await deps.db() : deps.db;
    const retry = await checkThrottle(db, parsed.batch.instanceId, now);
    if (retry)
      return failure(429, "RATE_LIMITED", "Rate limit reached.", { "retry-after": String(retry) });
    await persist(db, parsed.batch, now);
    return Response.json({ ok: true }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("ingest failed", error instanceof Error ? error.constructor.name : "Unknown");
    return failure(503, "INTERNAL", "Service unavailable.");
  }
}

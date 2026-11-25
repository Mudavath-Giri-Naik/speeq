import { getDb } from "@/db/client";
import { handleIngest } from "@/lib/ingest/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Accepts an anonymous telemetry batch. */
export function POST(request: Request) {
  return handleIngest(request, { db: getDb, now: () => new Date() });
}

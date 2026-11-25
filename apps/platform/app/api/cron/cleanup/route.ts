import { getDb } from "@/db/client";
import { handleCleanup } from "@/lib/cron/cleanup";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Runs authorized retention cleanup. */
export function GET(request: Request) {
  return handleCleanup(request, getDb);
}
export { GET as POST };
export function HEAD() {
  return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
}

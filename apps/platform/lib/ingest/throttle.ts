import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { ingestThrottle as throttle } from "../../db/schema";
/** Charges both counters atomically, with a consistent lock order. */
export async function checkThrottle(db: Db, id: string, now: Date) {
  const windowStart = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const rows = await db
    .insert(throttle)
    .values(["g:global", `i:${id}`].map((bucket) => ({ bucket, windowStart, count: 1 })))
    .onConflictDoUpdate({
      target: [throttle.bucket, throttle.windowStart],
      set: { count: sql`${throttle.count}+1` },
    })
    .returning();
  return rows.some((r) => r.count > (r.bucket === "g:global" ? 1200 : 10))
    ? Math.ceil((windowStart.getTime() + 60000 - now.getTime()) / 1000)
    : 0;
}

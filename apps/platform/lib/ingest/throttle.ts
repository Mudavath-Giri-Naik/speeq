import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { ingestThrottle as throttle } from "../../db/schema";
/** Charges both counters atomically, with a consistent lock order. */
export async function checkThrottle(db: Db, id: string, now: Date) {
  return chargeBuckets(
    db,
    now,
    60000,
    new Map([
      ["g:global", 1200],
      [`i:${id}`, 10],
    ]),
  );
}
/** Increments every supplied bucket in a single statement for a UTC-aligned window. */
export async function chargeBuckets(
  db: Db,
  now: Date,
  duration: number,
  limits: ReadonlyMap<string, number>,
) {
  const windowStart = new Date(Math.floor(now.getTime() / duration) * duration);
  const rows = await db
    .insert(throttle)
    .values(Array.from(limits.keys(), (bucket) => ({ bucket, windowStart, count: 1 })))
    .onConflictDoUpdate({
      target: [throttle.bucket, throttle.windowStart],
      set: { count: sql`${throttle.count}+1` },
    })
    .returning();
  return rows.some((r) => r.count > (limits.get(r.bucket) ?? 0))
    ? Math.ceil((windowStart.getTime() + duration - now.getTime()) / 1000)
    : 0;
}

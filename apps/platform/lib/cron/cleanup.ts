import { createHash, timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
import type { Db } from "../../db/client";
import { errorCounts, ingestThrottle, instances, usageRollups } from "../../db/schema";
import { retentionDays, setting } from "../env";
/** Removes expired aggregate records and obsolete throttle windows atomically. */
export function runCleanup(db: Db, now: Date, days: number) {
  const cutoff = new Date(now.getTime() - days * 86400000);
  return db.transaction(async (tx) => {
    const rollups = await tx
      .delete(usageRollups)
      .where(lt(usageRollups.receivedAt, cutoff))
      .returning();
    const errors = await tx
      .delete(errorCounts)
      .where(lt(errorCounts.receivedAt, cutoff))
      .returning();
    const throttle = await tx
      .delete(ingestThrottle)
      .where(lt(ingestThrottle.windowStart, new Date(now.getTime() - 3600000)))
      .returning();
    const stale = await tx.delete(instances).where(lt(instances.lastSeen, cutoff)).returning();
    return {
      rollups: rollups.length,
      errors: errors.length,
      throttle: throttle.length,
      instances: stale.length,
    };
  });
}
/** Authenticates before accessing storage. */
export async function handleCleanup(request: Request, db: () => Promise<Db>) {
  const secret = setting("CRON_SECRET");
  if (!secret) return Response.json({ ok: false }, { status: 503 });
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (
    !timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`))
  )
    return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({
      ok: true,
      deleted: await runCleanup(await db(), new Date(), retentionDays()),
    });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}

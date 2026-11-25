import type { TelemetryBatch } from "@speeq/core";
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { errorCounts, instances, usageRollups } from "../../db/schema";
import { findActiveProjectByKey } from "../projects";
/** Stores the allowed fields as a single transaction. */
export async function persist(db: Db, batch: TelemetryBatch, now: Date) {
  await db.transaction(async (tx) => {
    const projectId = batch.projectKey
      ? ((await findActiveProjectByKey(tx, batch.projectKey))?.id ?? null)
      : null;
    const init = batch.events.find((e) => e.type === "sdk.init");
    const metadata = init
      ? {
          sdkVersion:
            init.sdkVersions["@speeq/server"] ?? Object.values(init.sdkVersions)[0] ?? null,
          runtimeName: init.runtime.name,
          runtimeVersion: init.runtime.version,
          framework: init.framework,
          features: init.features,
        }
      : {};
    await tx
      .insert(instances)
      .values({
        instanceId: batch.instanceId,
        firstSeen: now,
        lastSeen: now,
        projectId,
        ...metadata,
      })
      .onConflictDoUpdate({
        target: instances.instanceId,
        set: {
          projectId: sql`coalesce(${instances.projectId}, excluded.project_id)`,
          lastSeen: now,
          ...metadata,
        },
      });
    for (const event of batch.events) {
      if (event.type === "sdk.init") continue;
      const period = {
        instanceId: batch.instanceId,
        projectId,
        receivedAt: now,
        periodStart: new Date(event.periodStart),
        periodEnd: new Date(event.periodEnd),
      };
      if (event.type === "error.rollup") {
        const rows = Object.entries(event.errors)
          .filter(([, count]) => count > 0)
          .map(([code, count]) => ({ ...period, code, count }));
        if (rows.length) await tx.insert(errorCounts).values(rows);
      } else {
        const c = event.counters;
        await tx.insert(usageRollups).values({
          ...period,
          sessions: c.sessions,
          turns: c.turns,
          voiceTurns: c.voiceTurns,
          textTurns: c.textTurns,
          toolBuiltin: c.toolCalls.builtin,
          toolCustom: c.toolCalls.custom,
          navigations: c.navigations,
          knowledgeSearches: c.knowledgeSearches,
          confirmationsRequested: c.confirmations.requested,
          confirmationsApproved: c.confirmations.approved,
          confirmationsRejected: c.confirmations.rejected,
          languages: c.languages,
          latencyTotal: c.latencyMs.total,
          latencyFirstToken: c.latencyMs.firstToken,
        });
      }
    }
  });
}

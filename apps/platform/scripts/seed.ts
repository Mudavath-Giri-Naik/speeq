import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Db } from "../db/client";
import { errorCounts, instances, projects, usageRollups } from "../db/schema";
import { assertSeedMode, clearRows, seedCli } from "./seed-clear";
/** Creates a repeatable anonymous fixture population for the last 90 UTC days. */
export async function seed(db: Db, now = new Date()) {
  assertSeedMode();
  let state = 90210;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const day = 86400000,
    today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const stamp = (i: number) => new Date(today + (i - 89) * day);
  await db.transaction(async (tx) => {
    await clearRows(tx);
    const teams = await tx
      .insert(projects)
      .values(
        ["Demo Academy", "Voice Notes"].map((name, i) => ({
          name: `[seed] ${name}`,
          key: `pk_SeedFixture${String(i).padStart(13, "0")}`,
          createdAt: stamp(0),
        })),
      )
      .returning();
    const rollups: (typeof usageRollups.$inferInsert)[] = [],
      errors: (typeof errorCounts.$inferInsert)[] = [];
    for (let i = 0; i < 40; i++) {
      const instanceId = `5eed0000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`,
        projectId = i % 5 === 0 ? null : teams[i % 2]?.id;
      const start = i * 2,
        end = 89 - (i % 7);
      await tx.insert(instances).values({
        instanceId,
        projectId,
        firstSeen: stamp(start),
        lastSeen: stamp(end),
        sdkVersion: ["0.1.0", "0.1.1", "0.2.0"][i % 3],
        runtimeName: ["node", "edge", "bun"][i % 3],
        runtimeVersion: ["22", "1", "1.2"][i % 3],
        framework: i % 4 ? "nextjs" : "unknown",
        features:
          i % 12 === 0
            ? null
            : {
                navigation: i % 5 !== 0,
                tools: true,
                knowledge: i % 2 === 0,
                audit: i % 4 !== 0,
                confirmations: i % 3 === 0,
                store: i % 2 ? "memory" : "mongodb",
                llm: i % 3 ? "openai-compatible" : "gemini",
                languageCount: 1 + (i % 4),
              },
      });
      for (let j = start; j <= end; j++) {
        const time = stamp(j),
          weekday = time.getUTCDay(),
          turns = Math.ceil(
            (10 + j / 4 + random() * 35) * (weekday === 0 || weekday === 6 ? 0.5 : 1),
          ),
          voiceTurns = Math.floor(turns * random());
        const period = {
          instanceId,
          projectId,
          periodStart: time,
          periodEnd: time,
          receivedAt: time,
        };
        const hist = () => {
          const bins = Array<number>(8).fill(0);
          for (let n = 0; n < turns; n++) {
            const slot = Math.min(7, Math.floor(random() ** 2 * 8));
            bins[slot] = (bins[slot] ?? 0) + 1;
          }
          return bins;
        };
        const first = Math.floor(turns * 0.6);
        rollups.push({
          ...period,
          sessions: Math.max(1, Math.floor(turns / 4)),
          turns,
          voiceTurns,
          textTurns: turns - voiceTurns,
          toolBuiltin: Math.floor(turns / 3),
          toolCustom: Math.floor(turns / 5),
          navigations: Math.floor(turns / 4),
          knowledgeSearches: Math.floor(turns / 6),
          confirmationsRequested: 3,
          confirmationsApproved: 2,
          confirmationsRejected: 1,
          languages: {
            "en-IN": first,
            [["te-IN", "hi-IN", "fr-FR"][i % 3] ?? "hi-IN"]: turns - first,
          },
          latencyTotal: hist(),
          latencyFirstToken: hist(),
        });
        if (j % 21 === 7 || random() < 0.02)
          errors.push({
            ...period,
            code: i % 2 ? "INTERNAL" : "RATE_LIMITED",
            count: j % 21 === 7 ? 4 : 1,
          });
      }
    }
    for (let i = 0; i < rollups.length; i += 100)
      await tx.insert(usageRollups).values(rollups.slice(i, i + 100));
    if (errors.length) await tx.insert(errorCounts).values(errors);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  seedCli(seed).catch(() => {
    console.error("Seed failed");
    process.exitCode = 1;
  });

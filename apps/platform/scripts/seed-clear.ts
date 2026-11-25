import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";

const { loadEnvConfig, updateInitialEnv } = nextEnv;

import { like, sql } from "drizzle-orm";
import { type Db, getDb, type Tx } from "../db/client";
import { instances, projects } from "../db/schema";
/** Refuses destructive fixture operations in production. */
export function assertSeedMode() {
  if (process.env.NODE_ENV === "production") throw new Error("Seed is disabled in production");
}
/** Deletes fixture rows identified by the documented seed namespace. */
export async function clearRows(tx: Tx) {
  await tx.delete(instances).where(sql`${instances.instanceId}::text like '5eed0000-%'`);
  await tx.delete(projects).where(like(projects.name, "[seed] %"));
}
/** Clears fixtures transactionally. */
export async function clearSeed(db: Db) {
  assertSeedMode();
  await db.transaction(clearRows);
}
/** Runs a fixture operation against the same configuration as Next. */
export async function seedCli(operation: (db: Db) => Promise<void>) {
  assertSeedMode();
  const logger = { info: () => {}, error: () => console.error("Environment load failed") };
  updateInitialEnv(loadEnvConfig(process.cwd(), true, logger).parsedEnv ?? {});
  loadEnvConfig(resolve("../.."), true, logger, true);
  assertSeedMode();
  const db = await getDb();
  try {
    await operation(db);
  } finally {
    if ("end" in db.$client) await db.$client.end();
    else await db.$client.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  seedCli(clearSeed).catch(() => {
    console.error("Seed cleanup failed");
    process.exitCode = 1;
  });

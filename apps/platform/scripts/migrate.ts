import { resolve } from "node:path";
import { loadEnvConfig, updateInitialEnv } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb, openPostgres } from "../db/client";
import { setting } from "../lib/env";

async function main() {
  const logger = { info: () => {}, error: () => console.error("Environment load failed") };
  const dev = process.env.NODE_ENV !== "production";
  updateInitialEnv(loadEnvConfig(process.cwd(), dev, logger).parsedEnv ?? {});
  loadEnvConfig(resolve("../.."), dev, logger, true);
  const url = setting("DATABASE_URL_DIRECT") ?? setting("DATABASE_URL");
  if (!url) {
    await getDb();
    return;
  }
  const client = openPostgres(url);
  try {
    await migrate(drizzle(client), { migrationsFolder: resolve("db/migrations") });
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error("Migration failed");
  process.exitCode = 1;
});

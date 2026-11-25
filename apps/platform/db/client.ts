import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as embedded } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { drizzle as remote } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { setting } from "../lib/env";
/** Safe configuration diagnostic. */
export class ConfigError extends Error {
  override name = "ConfigError";
}
/** Opens a pool compatible with a transaction pooler. */
export function openPostgres(url: string) {
  if (!/^postgres(?:ql)?:\/\//.test(url))
    throw new ConfigError("DATABASE_URL must be a postgres:// or postgresql:// connection string");
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 });
}
/** Opens a database and initializes embedded storage on first use. */
export async function createDb({
  dataDir = ".data/pglite",
  url,
}: {
  dataDir?: string;
  url?: string;
}) {
  if (url) return remote(openPostgres(url));
  if (dataDir !== "memory://") await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  try {
    const db = embedded(client);
    await migrate(db, { migrationsFolder: resolve("db/migrations") });
    return db;
  } catch (error) {
    await client.close();
    throw error;
  }
}
/** Common database operations for both supported drivers. */
export type Db = Awaited<ReturnType<typeof createDb>>;
/** Transaction shared by both drivers. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const local: { db?: Promise<Db> } = {};
const host = globalThis as typeof globalThis & { speeqPlatformDb?: typeof local };
if (process.env.NODE_ENV === "development") host.speeqPlatformDb ??= local;
const cache = host.speeqPlatformDb ?? local;
/** Lazily opens one connection pool and allows retry after initialization failure. */
export function getDb() {
  cache.db ??= createDb({
    url: setting("DATABASE_URL"),
    dataDir: setting("PGLITE_DIR"),
  }).catch((error) => {
    delete cache.db;
    throw error;
  });
  return cache.db;
}

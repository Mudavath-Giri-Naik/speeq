import { type SQL, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { AdminSession } from "../auth/session";
import type { Window } from "./range";
/** Normalizes postgres-js and PGlite result containers for parameterized dashboard SQL. */
export async function query<T>(db: Db, _session: AdminSession, statement: SQL): Promise<T[]> {
  const result = await db.execute(statement);
  return (Array.isArray(result) ? result : result.rows) as unknown as T[];
}
/** Restricts a trusted column expression to a half-open UTC interval. */
export function inWindow(column: SQL, w: Window) {
  return sql`${column} >= ${w.from.toISOString()}::timestamptz and ${column} < ${w.to.toISOString()}::timestamptz`;
}
/** An aggregate with a display label. */
export type Count = { label: string; value: number };

import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { AdminSession } from "../auth/session";
import { type Count, inWindow, query } from "./query";
import type { Window } from "./range";
/** Aggregates both latency distributions by ordinal across rollups. */
export async function histograms(
  db: Db,
  session: AdminSession,
  w: Window,
): Promise<{ total: number[]; first: number[] }> {
  const result = await query<{ slot: number; total: number; first: number }>(
    db,
    session,
    sql`select slot::int, sum(t::int)::float8 as total,sum(f::int)::float8 as first from usage_rollups cross join lateral rows from (jsonb_array_elements_text(latency_total),jsonb_array_elements_text(latency_first_token)) with ordinality as h(t,f,slot) where ${inWindow(sql`received_at`, w)} group by slot`,
  );
  const total = Array<number>(8).fill(0),
    first = [...total];
  for (const row of result) {
    total[row.slot - 1] = row.total;
    first[row.slot - 1] = row.first;
  }
  return { total, first };
}
/** Failure rates and latency samples for the selected interval. */
export interface Reliability {
  errors: Count[];
  daily: Count[];
  rate: number | null;
  total: number[];
  first: number[];
}
/** Groups error observations and zero-fills missing UTC days. */
export async function reliability(db: Db, session: AdminSession, w: Window): Promise<Reliability> {
  const where = inWindow(sql`received_at`, w);
  const [errors, days, usage, hist] = await Promise.all([
    query<Count>(
      db,
      session,
      sql`select code as label,sum(count)::float8 as value from error_counts where ${where} group by code order by value desc,code`,
    ),
    query<Count>(
      db,
      session,
      sql`select to_char(date_trunc('day',received_at at time zone 'UTC'),'YYYY-MM-DD') label,sum(count)::float8 as value from error_counts where ${where} group by 1`,
    ),
    query<{ turns: number }>(
      db,
      session,
      sql`select coalesce(sum(turns),0)::float8 as turns from usage_rollups where ${where}`,
    ),
    histograms(db, session, w),
  ]);
  const byDay = new Map(days.map((x) => [x.label, x.value])),
    turns = usage[0]?.turns ?? 0;
  return {
    errors,
    rate: turns ? (100 * errors.reduce((sum, row) => sum + row.value, 0)) / turns : null,
    daily: w.days.map((label) => ({ label, value: byDay.get(label) ?? 0 })),
    ...hist,
  };
}

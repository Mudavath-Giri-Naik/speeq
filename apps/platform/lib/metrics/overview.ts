import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { AdminSession } from "../auth/session";
import { type Count, inWindow, query } from "./query";
import type { Window } from "./range";
import { histograms } from "./reliability";

type Totals = {
  active: number;
  sessions: number;
  turns: number;
  voice: number;
  nav: number;
  builtin: number;
  custom: number;
  searches: number;
  approved: number;
  rejected: number;
};
type Day = { day: string; turns: number; sessions: number; installs: number };
/** Overview data for the selected calendar window. */
export interface Overview {
  totals: Totals;
  voiceShare: number | null;
  approvalRate: number | null;
  errorRate: number | null;
  daily: Day[];
  languages: Count[];
  histogram: number[];
}
/** Computes adoption, usage and response latency without loading individual observations. */
export async function overview(db: Db, s: AdminSession, w: Window): Promise<Overview> {
  const where = inWindow(sql`received_at`, w);
  const [rows, errorRows, usage, installed, languages, hist] = await Promise.all([
    query<Totals>(
      db,
      s,
      sql`select count(distinct instance_id)::float8 active,coalesce(sum(sessions),0)::float8 sessions,coalesce(sum(turns),0)::float8 turns,coalesce(sum(voice_turns),0)::float8 voice,coalesce(sum(navigations),0)::float8 nav,coalesce(sum(tool_builtin),0)::float8 builtin,coalesce(sum(tool_custom),0)::float8 custom,coalesce(sum(knowledge_searches),0)::float8 searches,coalesce(sum(confirmations_approved),0)::float8 approved,coalesce(sum(confirmations_rejected),0)::float8 rejected from usage_rollups where ${where}`,
    ),
    query<{ n: number }>(
      db,
      s,
      sql`select coalesce(sum(count),0)::float8 n from error_counts where ${where}`,
    ),
    query<Day>(
      db,
      s,
      sql`select to_char(date_trunc('day',received_at at time zone 'UTC'),'YYYY-MM-DD') as day,sum(turns)::float8 turns,sum(sessions)::float8 sessions from usage_rollups where ${where} group by 1`,
    ),
    query<Count>(
      db,
      s,
      sql`select to_char(first_seen at time zone 'UTC','YYYY-MM-DD') label,count(*)::float8 value from instances where ${inWindow(sql`first_seen`, w)} group by 1`,
    ),
    query<Count>(
      db,
      s,
      sql`select key label,sum(value::int)::float8 as value from usage_rollups cross join lateral jsonb_each_text(languages) where ${where} group by key order by value desc,key`,
    ),
    histograms(db, s, w),
  ]);
  const totals = rows[0];
  if (!totals) throw new Error("Metrics unavailable");
  const outcomes = totals.approved + totals.rejected,
    byDay = new Map(usage.map((x) => [x.day, x])),
    byInstall = new Map(installed.map((x) => [x.label, x.value]));
  return {
    totals,
    voiceShare: totals.turns ? (100 * totals.voice) / totals.turns : null,
    approvalRate: outcomes ? (100 * totals.approved) / outcomes : null,
    errorRate: totals.turns ? (100 * (errorRows[0]?.n ?? 0)) / totals.turns : null,
    languages,
    histogram: hist.total,
    daily: w.days.map((day) => ({
      day,
      turns: byDay.get(day)?.turns ?? 0,
      sessions: byDay.get(day)?.sessions ?? 0,
      installs: byInstall.get(day) ?? 0,
    })),
  };
}

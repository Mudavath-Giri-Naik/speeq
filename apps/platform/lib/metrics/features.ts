import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { AdminSession } from "../auth/session";
import { type Count, inWindow, query } from "./query";
import type { Window } from "./range";
/** Feature reporting denominators, adapter counts and observed usage mix. */
export interface Features {
  reported: number;
  avgLanguages: number | null;
  flags: Count[];
  store: Count[];
  llm: Count[];
  modes: Count[];
  tools: Count[];
}
/** Restricts configuration adoption to instances that reported init metadata. */
export async function features(db: Db, s: AdminSession, w: Window): Promise<Features> {
  const kinds = (kind: "store" | "llm") =>
    query<Count>(
      db,
      s,
      sql`select features->>${kind} label,count(*)::float8 value from instances where features is not null group by 1 order by value desc,label`,
    );
  const [counts, flags, stores, llms, mix] = await Promise.all([
    query<{ n: number; avg: number | null }>(
      db,
      s,
      sql`select count(*)::float8 n,avg((features->>'languageCount')::int)::float8 avg from instances where features is not null`,
    ),
    query<Count>(
      db,
      s,
      sql`select key label,count(*) filter(where value='true')::float8 as value from instances cross join lateral jsonb_each_text(features) where key in ('navigation','tools','knowledge','audit','confirmations') group by key order by key`,
    ),
    kinds("store"),
    kinds("llm"),
    query<{ voice: number; text: number; builtin: number; custom: number }>(
      db,
      s,
      sql`select coalesce(sum(voice_turns),0)::float8 voice,coalesce(sum(text_turns),0)::float8 text,coalesce(sum(tool_builtin),0)::float8 builtin,coalesce(sum(tool_custom),0)::float8 custom from usage_rollups where ${inWindow(sql`received_at`, w)}`,
    ),
  ] as const);
  const n = counts[0]?.n ?? 0,
    usage = mix?.[0];
  return {
    reported: n,
    avgLanguages: counts[0]?.avg ?? null,
    flags: flags.map((x) => ({ ...x, value: n ? (100 * x.value) / n : 0 })),
    store: stores ?? [],
    llm: llms ?? [],
    modes: [
      { label: "Voice", value: usage?.voice ?? 0 },
      { label: "Text", value: usage?.text ?? 0 },
    ],
    tools: [
      { label: "Built-in", value: usage?.builtin ?? 0 },
      { label: "Custom", value: usage?.custom ?? 0 },
    ],
  };
}

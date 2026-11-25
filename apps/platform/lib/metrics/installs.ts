import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { AdminSession } from "../auth/session";
import { type Count, query } from "./query";
import type { Window } from "./range";
/** Validates the one-based page without accepting fractional or excessive offsets. */
export function parsePage(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,7}$/.test(value)) return 1;
  return Math.max(1, Number(value));
}
type Install = {
  rowKey: string;
  id: string;
  project: string;
  sdk: string;
  runtime: string;
  framework: string;
  first: string;
  last: string;
};
/** Paginated installs and population distributions. */
export interface Installs {
  rows: Install[];
  pages: number;
  page: number;
  active: number;
  sdk: Count[];
  runtime: Count[];
  framework: Count[];
}
/** Lists anonymous instance prefixes and grouped deployment attributes. */
export async function installs(
  db: Db,
  s: AdminSession,
  { window: w, page: requested }: { window: Window; page: number },
): Promise<Installs> {
  const [stats] = await query<{ n: number; active: number }>(
    db,
    s,
    sql`select count(*)::float8 n,count(*) filter(where last_seen >= ${new Date(+w.to - 7 * 86400000).toISOString()}::timestamptz)::float8 active from instances`,
  );
  const pages = Math.max(1, Math.ceil((stats?.n ?? 0) / 25)),
    page = Number.isSafeInteger(requested) && requested >= 1 && requested <= pages ? requested : 1;
  const [rows, ...groups] = await Promise.all([
    query<Install>(
      db,
      s,
      sql`select md5(instance_id::text) as "rowKey", left(instance_id::text,8) id,coalesce(p.name,'unattributed') project,coalesce(sdk_version,'Unknown') sdk,coalesce(concat_ws(' ',runtime_name,runtime_version), 'Unknown') runtime,coalesce(framework,'Unknown') framework,to_char(first_seen at time zone 'UTC','YYYY-MM-DD HH24:MI') first,to_char(last_seen at time zone 'UTC','YYYY-MM-DD HH24:MI') last from instances i left join projects p on i.project_id=p.id order by last_seen desc, instance_id limit 25 offset ${(page - 1) * 25}`,
    ),
    ...[sql`sdk_version`, sql`runtime_name`, sql`framework`].map((col) =>
      query<Count>(
        db,
        s,
        sql`select coalesce(${col},'Unknown') label,count(*)::float8 value from instances group by 1 order by value desc,label`,
      ),
    ),
  ]);
  return {
    rows,
    pages,
    page,
    active: stats?.active ?? 0,
    sdk: groups[0] ?? [],
    runtime: groups[1] ?? [],
    framework: groups[2] ?? [],
  };
}

import { sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import type { AdminSession } from "../auth/session";
import { inWindow, query } from "./query";
import type { Window } from "./range";
/** A project and its attributed aggregate activity. */
export interface ProjectRow {
  id: string;
  name: string;
  key: string;
  created: string;
  revoked: boolean;
  instances: number;
  turns: number;
  activity: string | null;
}
/** Groups rollups separately from installs to avoid multiplying counts. */
export function projectMetrics(db: Db, s: AdminSession, w: Window): Promise<ProjectRow[]> {
  return query(
    db,
    s,
    sql`select p.id,p.name,p.key,to_char(created_at at time zone 'UTC','YYYY-MM-DD') created,revoked_at is not null revoked, coalesce(i.n,0)::float8 instances,coalesce(u.n,0)::float8 turns,to_char(i.last at time zone 'UTC','YYYY-MM-DD HH24:MI') activity from projects p left join (select project_id,count(*) n,max(last_seen) last from instances group by project_id) i on i.project_id=p.id left join (select project_id,sum(turns) n from usage_rollups where ${inWindow(sql`received_at`, w)} group by project_id) u on u.project_id=p.id order by created_at desc,p.id`,
  );
}

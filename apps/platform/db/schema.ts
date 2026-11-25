import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const date = (name: string) => timestamp(name, { withTimezone: true });
const id = () => uuid("id").defaultRandom().primaryKey();
const count = (name: string) => integer(name).notNull();
/** Public project attribution keys. */
export const projects = pgTable(
  "projects",
  {
    id: id(),
    name: text("name").notNull(),
    key: text("key").notNull().unique(),
    createdAt: date("created_at").defaultNow().notNull(),
    revokedAt: date("revoked_at"),
  },
  (t) => [check("project_name_length", sql`char_length(${t.name}) between 1 and 80`)],
);
const projectId = () => uuid("project_id").references(() => projects.id, { onDelete: "set null" });
/** First and most recent observations of an SDK instance. */
export const instances = pgTable("instances", {
  instanceId: uuid("instance_id").primaryKey(),
  projectId: projectId(),
  firstSeen: date("first_seen").notNull(),
  lastSeen: date("last_seen").notNull(),
  sdkVersion: text("sdk_version"),
  runtimeName: text("runtime_name"),
  runtimeVersion: text("runtime_version"),
  framework: text("framework"),
  features: jsonb("features"),
});
const period = () => ({
  id: id(),
  instanceId: uuid("instance_id")
    .notNull()
    .references(() => instances.instanceId, { onDelete: "cascade" }),
  projectId: projectId(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  receivedAt: date("received_at").notNull(),
});
/** Aggregate counters per reporting period. */
export const usageRollups = pgTable(
  "usage_rollups",
  {
    ...period(),
    sessions: count("sessions"),
    turns: count("turns"),
    voiceTurns: count("voice_turns"),
    textTurns: count("text_turns"),
    toolBuiltin: count("tool_builtin"),
    toolCustom: count("tool_custom"),
    navigations: count("navigations"),
    knowledgeSearches: count("knowledge_searches"),
    confirmationsRequested: count("confirmations_requested"),
    confirmationsApproved: count("confirmations_approved"),
    confirmationsRejected: count("confirmations_rejected"),
    languages: jsonb("languages").notNull(),
    latencyTotal: jsonb("latency_total").notNull(),
    latencyFirstToken: jsonb("latency_first_token").notNull(),
  },
  (t) => [
    index("usage_received_idx").on(t.receivedAt),
    index("usage_project_received_idx").on(t.projectId, t.receivedAt),
  ],
);
/** Nonzero counts by stable error code. */
export const errorCounts = pgTable(
  "error_counts",
  { ...period(), code: text("code").notNull(), count: count("count") },
  (t) => [index("errors_code_received_idx").on(t.code, t.receivedAt)],
);
/** Cached aggregate responses from the package and repository registries. */
export const externalStats = pgTable("external_stats", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  ok: boolean("ok").notNull(),
  fetchedAt: date("fetched_at").notNull(),
});
/** Shared per-minute ingest limits. */
export const ingestThrottle = pgTable(
  "ingest_throttle",
  {
    bucket: text("bucket").notNull(),
    windowStart: date("window_start").notNull(),
    count: count("count"),
  },
  (t) => [primaryKey({ columns: [t.bucket, t.windowStart] })],
);

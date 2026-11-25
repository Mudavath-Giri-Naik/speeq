import { PGlite } from "@electric-sql/pglite";
import type { TelemetryBatch } from "@speeq/core";
import { createSpeeq, defineTool } from "@speeq/server";
import { createMemoryStore } from "@speeq/store-memory";
import { FakeLLMProvider, startSession } from "@speeq/testing";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConfigError, createDb, type Db, getDb } from "../db/client";
import { errorCounts, ingestThrottle, instances, projects, usageRollups } from "../db/schema";
import { handleCleanup, runCleanup } from "../lib/cron/cleanup";
import { retentionDays } from "../lib/env";
import { handleIngest } from "../lib/ingest/handler";
import { MAX_INGEST_BYTES, readBoundedBody } from "../lib/ingest/read-body";
import { validateIngest } from "../lib/ingest/validate";
import { createProject, revokeProject } from "../lib/projects";

let db: Db;
beforeAll(async () => {
  db = await createDb({ dataDir: "memory://" });
}, 30000);
beforeEach(async () => {
  await db.execute(
    sql`truncate projects,instances,usage_rollups,error_counts,ingest_throttle cascade`,
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const now = new Date(),
  ts = now.toISOString();
const iso = (ms: number) => new Date(+now + ms).toISOString();
const request = (body?: string, headers: Record<string, string> = {}, method = "POST") =>
  new Request("http://platform.invalid/ingest", {
    method,
    body,
    headers: { "content-type": "application/json", ...headers },
  });
function batch() {
  const counters = {
    turns: 0,
    voiceTurns: 0,
    textTurns: 0,
    sessions: 1,
    toolCalls: { builtin: 0, custom: 1 },
    navigations: 0,
    knowledgeSearches: 0,
    confirmations: { requested: 0, approved: 1, rejected: 0 },
    languages: {},
    latencyMs: { total: Array<number>(8).fill(0), firstToken: Array<number>(8).fill(0) },
  };
  const usage = {
    type: "usage.rollup" as const,
    ts,
    periodStart: iso(-1000),
    periodEnd: ts,
    counters,
  };
  const init = {
    type: "sdk.init" as const,
    ts,
    sdkVersions: { "@speeq/server": "1" },
    framework: "unknown" as const,
    runtime: { name: "node" as const, version: "22" },
    features: {
      navigation: false,
      tools: true,
      knowledge: false,
      audit: false,
      confirmations: true,
      store: "memory",
      llm: "fake",
      languageCount: 1,
    },
  };
  const error = {
    type: "error.rollup" as const,
    ts,
    periodStart: ts,
    periodEnd: ts,
    errors: { INTERNAL: 1, FORBIDDEN: 0 },
  };
  return {
    instanceId: crypto.randomUUID(),
    schemaVersion: 1 as const,
    sentAt: ts,
    events: [init, usage, error] as [typeof init, typeof usage, typeof error],
  };
}
const ingest = (r: Request, clock = now) => handleIngest(r, { db, now: () => clock });
const post = (value: unknown, clock = now) => ingest(request(JSON.stringify(value)), clock);
it("accepts approval in a later interval and stores normalized values", async () => {
  const b = batch();
  expect((await post(b)).status).toBe(202);
  expect(await db.select().from(usageRollups)).toMatchObject([
    { turns: 0, confirmationsApproved: 1, toolCustom: 1, receivedAt: now },
  ]);
  expect(await db.select().from(errorCounts)).toMatchObject([{ code: "INTERNAL", count: 1 }]);
  expect(await db.select().from(instances)).toMatchObject([
    { instanceId: b.instanceId, runtimeName: "node", sdkVersion: "1" },
  ]);
});
it("checks method, media type, missing body and bounded byte size in order", async () => {
  const wrong = await ingest(request(undefined, {}, "GET"));
  expect(wrong.status).toBe(405);
  expect(wrong.headers.get("allow")).toBe("POST");
  expect(
    (await ingest(request("bad", { "content-type": "text/plain", "content-length": "999999" })))
      .status,
  ).toBe(415);
  expect((await ingest(request())).status).toBe(400);
  expect((await ingest(request("{"))).status).toBe(400);
  expect((await readBoundedBody(request("x".repeat(MAX_INGEST_BYTES)))).ok).toBe(true);
  expect(
    (await ingest(request("x".repeat(MAX_INGEST_BYTES + 1), { "content-length": "1" }))).status,
  ).toBe(413);
  const declared = request("tiny", { "content-length": "65537" });
  expect((await ingest(declared)).status).toBe(413);
  expect(declared.bodyUsed).toBe(false);
});
it("rejects unknown fields, malformed event sets, times and impossible turn counts", () => {
  const b = batch(),
    [init, usage] = b.events,
    c = usage.counters;
  const invalid = [
    { ...b, secret: 1 },
    { ...b, schemaVersion: 2 },
    { ...b, events: [] },
    { ...b, events: Array(51).fill(init) },
    { ...b, events: [usage, usage] },
    ...[-25 * 3600000, 360000].map((ms) => ({ ...b, sentAt: iso(ms) })),
    ...[
      { ...init, extra: 1 },
      { ...init, ts: iso(-8 * 86400000) },
      { ...init, ts: iso(360000) },
      { ...usage, periodEnd: iso(-2000) },
      { ...usage, periodEnd: iso(360000) },
      { ...usage, periodStart: iso(-8 * 86400000) },
      ...[
        { extra: 1 },
        { voiceTurns: 1 },
        { languages: { en: 1 } },
        { latencyMs: { ...c.latencyMs, total: [1, 0, 0, 0, 0, 0, 0, 0] } },
        { latencyMs: { ...c.latencyMs, firstToken: [1, 0, 0, 0, 0, 0, 0, 0] } },
      ].map((patch) => ({ ...usage, counters: { ...c, ...patch } })),
    ].map((event) => ({ ...b, events: [event] })),
  ];
  for (const item of invalid)
    expect(validateIngest("application/json", JSON.stringify(item), now)).toEqual({
      ok: false,
      status: 400,
      code: "INVALID_INPUT",
    });
});
it("rejects garbage before charging either bucket or echoing details", async () => {
  for (let i = 0; i < 50; i++) {
    const r = await post({ ...batch(), privateCanary: "never echo" });
    expect(r.status).toBe(400);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.text()).not.toMatch(/privateCanary|never echo|Expected|Invalid input/);
  }
  expect(await db.select().from(ingestThrottle)).toEqual([]);
});
it("attributes active keys per batch and preserves first instance attribution and metadata", async () => {
  const a = await createProject(db, "A"),
    b = await createProject(db, "B");
  expect(a.key).toMatch(/^pk_[a-zA-Z0-9]{24}$/);
  const data = batch();
  const known = await post({ ...data, projectKey: a.key });
  const later = new Date(+now + 1000);
  const changed = await post({ ...data, events: [data.events[1]], projectKey: b.key }, later);
  expect(changed.status).toBe(202);
  expect(await db.select().from(instances)).toMatchObject([
    { firstSeen: now, lastSeen: later, projectId: a.id, sdkVersion: "1" },
  ]);
  await revokeProject(db, b.id);
  for (const key of [b.key, "pk_unknown000"]) {
    const body = { ...batch(), projectKey: key };
    const r = await post(body);
    expect(r.status).toBe(202);
    expect(await r.text()).toBe(await known.clone().text());
    expect(
      await db.select().from(usageRollups).where(eq(usageRollups.instanceId, body.instanceId)),
    ).toMatchObject([{ projectId: null }]);
  }
});
it("rolls back the entire batch on an error insert and fails closed on throttle errors", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await db.transaction(async (tx) => {
    await tx.execute(sql`alter table error_counts add constraint test_failure check (count < 1)`);
  });
  try {
    expect((await post(batch())).status).toBe(503);
    expect(await db.select().from(instances)).toEqual([]);
    expect(await db.select().from(usageRollups)).toEqual([]);
  } finally {
    await db.execute(sql`alter table error_counts drop constraint test_failure`);
  }
  await db.execute(sql`alter table ingest_throttle rename to throttle_offline`);
  try {
    expect((await post(batch())).status).toBe(503);
    expect(await db.select().from(instances)).toEqual([]);
  } finally {
    await db.execute(sql`alter table throttle_offline rename to ingest_throttle`);
  }
});
it("enforces both minute limits under concurrency", async () => {
  const b = batch();
  const responses = await Promise.all(Array.from({ length: 20 }, () => post(b)));
  expect(responses.filter((r) => r.status === 202)).toHaveLength(10);
  expect(responses.filter((r) => r.status === 429)).toHaveLength(10);
  expect(Number(responses.find((r) => r.status === 429)?.headers.get("retry-after"))).toBe(
    60 - now.getUTCSeconds(),
  );
  expect((await post(batch())).status).toBe(202);
  await db.update(ingestThrottle).set({ count: 1199 }).where(eq(ingestThrottle.bucket, "g:global"));
  expect((await post(batch())).status).toBe(202);
  expect((await post(batch())).status).toBe(429);
});
it("authenticates cleanup and removes only expired records", async () => {
  const token = crypto.randomUUID();
  const call = (header = "") =>
    handleCleanup(request(undefined, { authorization: header }, "GET"), async () => db);
  vi.stubEnv("CRON_SECRET", "");
  expect((await call()).status).toBe(503);
  vi.stubEnv("CRON_SECRET", token);
  expect((await call()).status).toBe(401);
  expect((await call("Bearer x")).status).toBe(401);
  for (const value of ["x", "0", "3651", "1.5"]) expect(retentionDays(value)).toBe(90);
  const old = batch(),
    fresh = batch();
  await post(old);
  await post(fresh);
  const expired = new Date(iso(-91 * 86400000));
  await db
    .update(instances)
    .set({ lastSeen: expired })
    .where(eq(instances.instanceId, old.instanceId));
  await db
    .update(usageRollups)
    .set({ receivedAt: expired })
    .where(eq(usageRollups.instanceId, old.instanceId));
  await db
    .update(ingestThrottle)
    .set({ windowStart: expired })
    .where(eq(ingestThrottle.bucket, "g:global"));
  expect(await runCleanup(db, now, 90)).toEqual({
    rollups: 1,
    errors: 0,
    instances: 1,
    throttle: 1,
  });
  expect(await db.select().from(errorCounts)).toMatchObject([{ instanceId: fresh.instanceId }]);
  const r = await call(`Bearer ${token}`);
  expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({ ok: true, deleted: { instances: 0 } });
});
it("rejects invalid database configuration safely and migrations are idempotent", async () => {
  vi.stubEnv("DATABASE_URL", "https://fixture.invalid");
  await expect(getDb()).rejects.toThrow(ConfigError);
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const r = await handleIngest(request(JSON.stringify(batch())), { db: getDb, now: () => now });
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("fixture");
  expect(log.mock.calls.flat().join(" ")).not.toContain("fixture");
  const client = new PGlite();
  try {
    const fresh = drizzle(client);
    for (let i = 0; i < 2; i++) await migrate(fresh, { migrationsFolder: "db/migrations" });
    expect(await fresh.select().from(projects)).toEqual([]);
  } finally {
    await client.close();
  }
}, 30000);
it("ingests both SDK batches for a bookmark request and approval", async () => {
  const batches: TelemetryBatch[] = [];
  const speeq = createSpeeq({
    secret: crypto.randomUUID(),
    agent: { name: "Test", instructions: "Help" },
    store: createMemoryStore({ quiet: true }),
    llm: new FakeLLMProvider([
      { toolCalls: [{ name: "bookmark", arguments: {} }] },
      { text: "Saved." },
    ]),
    tools: [
      defineTool({
        name: "bookmark",
        description: "Save",
        risk: "write",
        input: z.object({}),
        handler: () => ({ saved: true }),
      }),
    ],
    telemetry: {
      flushIntervalMs: 0,
      transport: {
        send: async (b) => {
          batches.push(b);
        },
      },
    },
  });
  const session = await startSession(speeq.handler);
  const events = await session.turn("bookmark");
  const pending = events.find((e) => e.type === "confirmation.required");
  if (!pending) throw new Error("Missing confirmation");
  await session.confirm(pending.confirmationId, true);
  expect(batches).toHaveLength(2);
  for (const b of batches) expect((await post(b, new Date())).status).toBe(202);
  expect(await db.select().from(usageRollups)).toMatchObject([
    { turns: 1, confirmationsRequested: 1 },
    { turns: 0, confirmationsApproved: 1 },
  ]);
});

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { create, revoke } from "../app/dashboard/projects/actions";
import { createDb, type Db } from "../db/client";
import {
  errorCounts,
  externalStats,
  ingestThrottle,
  instances,
  projects,
  usageRollups,
} from "../db/schema";
import { adminCookie } from "../lib/auth/cookie";
import { attemptLogin, clientIp } from "../lib/auth/login";
import {
  type AdminSession,
  authStatus,
  createAdminToken,
  readAdminSession,
  requireAdmin,
} from "../lib/auth/session";
import { getGithubStats, getNpmDownloads } from "../lib/external-stats";
import { features } from "../lib/metrics/features";
import { percentileFromHistogram as percentile } from "../lib/metrics/histogram";
import { installs, parsePage } from "../lib/metrics/installs";
import { overview } from "../lib/metrics/overview";
import { projectMetrics } from "../lib/metrics/projects";
import { parseRange, rangeWindow } from "../lib/metrics/range";
import { reliability } from "../lib/metrics/reliability";
import { seed } from "../scripts/seed";
import { clearSeed } from "../scripts/seed-clear";

let db: Db;
beforeAll(async () => {
  db = await createDb({ dataDir: "memory://" });
}, 60000);
afterAll(async () => {
  if (db && "close" in db.$client) await db.$client.close();
});
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(path);
  }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

describe("auth", () => {
  const now = new Date("2025-05-02T12:00:00Z");
  const key = randomUUID(),
    password = randomUUID();
  const login = (client = "client-A", submitted: string = password, time = now) =>
    attemptLogin({ password: submitted, clientIp: client, now: time }, { db });

  beforeEach(async () => {
    vi.stubEnv("SESSION_SECRET", key);
    vi.stubEnv("ADMIN_PASSWORD", password);
    mocks.get.mockReset();
    await db.delete(ingestThrottle);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  it("accepts one trailing newline, checks length and keeps the timing floor", async () => {
    const start = performance.now();
    expect(await login("A", "wrong")).toEqual({ ok: false, reason: "invalid" });
    expect(performance.now() - start).toBeGreaterThanOrEqual(299);
    const result = await login("A", `${password}\n`);
    expect(result.ok && (await readAdminSession(result.token, now))).toMatchObject({
      expiresAt: new Date(+now + 28800000),
    });
    for (const v of ["a".repeat(257), `${password} `, `${password}\n\n`])
      expect(await login("A", v)).toEqual({ ok: false, reason: "invalid" });
  });
  it("enforces production config and development defaults", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(authStatus().enabled).toBe(false);
    expect(await login()).toMatchObject({ reason: "disabled" });
    vi.stubEnv("ADMIN_PASSWORD", password);
    vi.stubEnv("SESSION_SECRET", "short");
    expect(authStatus().enabled).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(authStatus().mode).toBe("development-defaults");
    expect((await login("dev", "admin")).ok).toBe(true);
  });
  it("rejects invalid tokens without throwing", async () => {
    const encoder = new TextEncoder();
    const signed = (iss: string, aud: string, sub: string, secret: string = key, alg = "HS256") =>
      new SignJWT({})
        .setProtectedHeader({ alg })
        .setSubject(sub)
        .setIssuer(iss)
        .setAudience(aud)
        .setIssuedAt(+now / 1000)
        .setExpirationTime(+now / 1000 + 1000)
        .setJti(randomUUID())
        .sign(encoder.encode(secret));
    const token = await createAdminToken(now);
    const pieces = token.split(".");
    pieces[1] = Buffer.from(JSON.stringify({ sub: "changed" })).toString("base64url");
    for (const v of [
      pieces.join("."),
      await signed("wrong", "dashboard", "admin"),
      await signed("speeq-platform", "wrong", "admin"),
      await signed("speeq-platform", "dashboard", "other"),
      await signed("speeq-platform", "dashboard", "admin", randomUUID()),
      await signed("speeq-platform", "dashboard", "admin", key.repeat(2), "HS512"),
      `${Buffer.from('{"alg":"none"}').toString("base64url")}.e30.`,
      "malformed",
      "",
      undefined,
    ])
      expect(await readAdminSession(v, now)).toBeNull();
    expect(await readAdminSession(token, new Date(+now + 28806000))).toBeNull();
  });
  it("charges both windows atomically, isolates clients and rolls over", async () => {
    const attempts = await Promise.all(Array.from({ length: 20 }, () => login()));
    expect(attempts.filter((x) => x.ok)).toHaveLength(8);
    expect(attempts.filter((x) => !x.ok && x.reason === "throttled")).toHaveLength(12);
    const start = performance.now();
    expect(await login()).toMatchObject({ reason: "throttled" });
    expect(performance.now() - start).toBeLessThan(299);
    expect((await login("different")).ok).toBe(true);
    const buckets = await db.select().from(ingestThrottle);
    expect(buckets.map((x) => x.bucket).join(" ")).not.toContain("client-A");
    expect(buckets.every((x) => /^login:(global|[0-9a-f]{32})$/.test(x.bucket))).toBe(true);
    await db
      .update(ingestThrottle)
      .set({ count: 99 })
      .where(eq(ingestThrottle.bucket, "login:global"));
    expect((await login("last")).ok).toBe(true);
    expect(await login("next")).toMatchObject({ reason: "throttled" });
    expect((await login("client-A", password, new Date(+now + 900000))).ok).toBe(true);
  });
  it("fails closed and trusts forwarding headers only with explicit opt-in", async () => {
    const headers = new Headers({
      "x-forwarded-for": " test-client, other",
      "x-real-ip": "fallback",
    });
    vi.stubEnv("TRUST_PROXY_HEADERS", "");
    expect(clientIp(headers)).toBe("unknown");
    vi.stubEnv("TRUST_PROXY_HEADERS", "1");
    expect(clientIp(headers)).toBe("test-client");
    headers.delete("x-forwarded-for");
    expect(clientIp(headers)).toBe("fallback");
    await db.execute(sql`alter table ingest_throttle rename to hidden_throttle`);
    try {
      expect(await login()).toMatchObject({ reason: "unavailable" });
    } finally {
      await db.execute(sql`alter table hidden_throttle rename to ingest_throttle`);
    }
  });
  it("uses matching cookie attributes for sign-in and logout", () => {
    for (const prod of [true, false]) {
      vi.stubEnv("NODE_ENV", prod ? "production" : "development");
      const flags = {
        name: prod ? "__Host-speeq_admin" : "speeq_admin",
        secure: prod,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      };
      expect(adminCookie()).toEqual({ ...flags, maxAge: 28800 });
      expect(adminCookie(true)).toEqual({ ...flags, maxAge: 0 });
    }
  });
  it("protects actions on submission and validates mutations", async () => {
    await expect(requireAdmin()).rejects.toThrow("/login");
    const token = await createAdminToken();
    const s = await readAdminSession(token);
    if (!s) throw new Error("Missing test session");
    for (const action of [create, revoke])
      await expect(action(s, new FormData())).rejects.toThrow("/login");
    mocks.get.mockReturnValue({ value: token });
    expect(await requireAdmin()).toEqual(s);
    for (const name of [" ", "a".repeat(81)]) {
      const data = new FormData();
      data.set("name", name);
      await expect(create(s, data)).rejects.toThrow("error=invalid");
    }
    const data = new FormData();
    data.set("id", "invalid");
    await expect(revoke(s, data)).rejects.toThrow("error=invalid");
  });
});
describe("metrics", () => {
  let s: AdminSession;
  const now = new Date("2025-02-01T04:15:00Z"),
    w = rangeWindow("7d", now);
  beforeAll(async () => {
    const session = await readAdminSession(await createAdminToken());
    if (!session) throw new Error("Missing fixture session");
    s = session;
  }, 60000);
  beforeEach(async () => {
    await db.execute(sql`truncate instances,projects cascade`);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("validates UTC windows, pagination and histogram percentiles", () => {
    expect(parseRange("1y")).toBe("30d");
    expect(w.days).toHaveLength(7);
    expect(w.days[0]).toBe("2025-01-26");
    expect(w.days.at(-1)).toBe("2025-02-01");
    for (const x of ["0", "-1", "999999999999999", "oops"]) expect(parsePage(x)).toBe(1);
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([1], 0.95)).toBe(250);
    expect(percentile([5, 4, 1], 0.5)).toBe(250);
    expect(percentile([5, 4, 1], 0.95)).toBe(1000);
    expect(percentile([0, 0, 0, 0, 0, 0, 0, 2], 0.95)).toEqual({ overflow: true });
  });
  it("aggregates known usage, zero fills and excludes unreported features", async () => {
    const empty = await overview(db, s, w);
    expect(empty.approvalRate).toBeNull();
    expect(empty.errorRate).toBeNull();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const [i, id] of ids.entries()) {
      await db.insert(instances).values({
        instanceId: id,
        firstSeen: now,
        lastSeen: now,
        features:
          i === 2 ? null : { tools: i === 0, store: "memory", llm: "custom", languageCount: i + 1 },
        sdkVersion: "1",
      });
    }
    for (const id of ids.slice(0, 2)) {
      const period = { instanceId: id, periodStart: now, periodEnd: now, receivedAt: now };
      await db.insert(usageRollups).values({
        ...period,
        sessions: 1,
        turns: 4,
        voiceTurns: 1,
        textTurns: 3,
        toolBuiltin: 1,
        toolCustom: 2,
        navigations: 1,
        knowledgeSearches: 0,
        confirmationsRequested: 3,
        confirmationsApproved: 2,
        confirmationsRejected: 1,
        languages: { en: 3 },
        latencyTotal: [1, 3, 0, 0, 0, 0, 0, 0],
        latencyFirstToken: [1, 0, 0, 0, 0, 0, 0, 0],
      });
      await db.insert(errorCounts).values({ ...period, code: "INTERNAL", count: 1 });
    }
    const o = await overview(db, s, w);
    expect(o.totals).toMatchObject({ active: 2, turns: 8, sessions: 2 });
    expect(o.voiceShare).toBe(25);
    expect(o.approvalRate).toBeCloseTo(200 / 3);
    expect(o.errorRate).toBe(25);
    expect(o.daily.map((x) => x.turns)).toEqual([0, 0, 0, 0, 0, 0, 8]);
    expect(o.languages).toEqual([{ label: "en", value: 6 }]);
    const f = await features(db, s, w);
    expect(f).toMatchObject({
      reported: 2,
      avgLanguages: 1.5,
      flags: [{ label: "tools", value: 50 }],
    });
    const i = await installs(db, s, { window: w, page: 900 });
    expect(i.page).toBe(1);
    expect(i.rows).toHaveLength(3);
    expect(i.rows.every((x) => x.id.length === 8 && x.project === "unattributed")).toBe(true);
    expect(i.sdk).toEqual([{ label: "1", value: 3 }]);
    const r = await reliability(db, s, w);
    expect(r).toMatchObject({
      rate: 25,
      errors: [{ label: "INTERNAL", value: 2 }],
      total: [2, 6, 0, 0, 0, 0, 0, 0],
      first: [2, 0, 0, 0, 0, 0, 0, 0],
    });
    const missingSession = async () => {
      // @ts-expect-error A dashboard query requires an authenticated session.
      await overview(db, w);
    };
    expect(missingSession).toBeTypeOf("function");
  });
  it("regenerates invariant-respecting fixtures and removes only the seed namespace", async () => {
    const id = randomUUID();
    await db.insert(instances).values({ instanceId: id, firstSeen: now, lastSeen: now });
    await db.insert(projects).values({
      name: "Independent fixture",
      key: `pk_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
    });
    await seed(db, now);
    const rows = await db.select().from(usageRollups);
    expect(rows.length).toBeGreaterThan(1000);
    expect(
      rows.every(
        (r) =>
          r.turns === r.textTurns + r.voiceTurns &&
          Object.values(r.languages as Record<string, number>).reduce((a, b) => a + b, 0) <=
            r.turns &&
          [r.latencyTotal, r.latencyFirstToken].every(
            (x) => Array.isArray(x) && x.length === 8 && x.reduce((a, b) => a + b, 0) <= r.turns,
          ) &&
          r.periodEnd >= r.periodStart &&
          +r.periodEnd - +r.periodStart <= 7 * 86400000,
      ),
    ).toBe(true);
    await seed(db, now);
    expect(await db.select().from(usageRollups)).toHaveLength(rows.length);
    expect(await projectMetrics(db, s, w)).toHaveLength(3);
    expect((await installs(db, s, { window: w, page: 2 })).rows).toHaveLength(16);
    await clearSeed(db);
    expect(await db.select().from(instances)).toMatchObject([{ instanceId: id }]);
    expect(await db.select().from(projects)).toMatchObject([{ name: "Independent fixture" }]);
    expect(await db.select().from(usageRollups)).toHaveLength(0);
    vi.stubEnv("NODE_ENV", "production");
    await expect(seed(db)).rejects.toThrow("production");
    await expect(clearSeed(db)).rejects.toThrow("production");
  }, 60000);
});
describe("stats", () => {
  let session: AdminSession;
  const fetcher = vi.fn<typeof fetch>();
  beforeAll(async () => {
    const s = await readAdminSession(await createAdminToken());
    if (!s) throw new Error("Missing fixture session");
    session = s;
  }, 60000);
  beforeEach(async () => {
    await db.delete(externalStats);
    fetcher.mockReset();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("GITHUB_REPO", "fixture/repo");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("requests fixed registry data and caches successful entries", async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith("core")
        ? Response.json({ downloads: 25 })
        : new Response(null, { status: 404 }),
    );
    const npm = await getNpmDownloads(db, session);
    expect(npm[0]?.stat).toEqual({
      status: "ok",
      value: { published: true, downloads: 25 },
      stale: false,
    });
    expect(npm[1]?.stat).toMatchObject({ value: { published: false } });
    expect(fetcher).toHaveBeenCalledTimes(4);
    await getNpmDownloads(db, session);
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [, options] of fetcher.mock.calls)
      expect(options).toMatchObject({
        method: "GET",
        redirect: "error",
        credentials: "omit",
        headers: { accept: "application/json", "user-agent": "speeq-platform" },
      });
  });
  it("skips invalid repository names and serves stale successes for fifteen minutes", async () => {
    vi.stubEnv("GITHUB_REPO", "bad//path");
    expect(await getGithubStats(db, session)).toEqual({ status: "not-configured" });
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("GITHUB_REPO", "fixture/repo");
    fetcher.mockResolvedValueOnce(Response.json({ stargazers_count: 3, forks_count: 1 }));
    expect(await getGithubStats(db, session)).toMatchObject({
      status: "ok",
      value: { stars: 3, forks: 1 },
      stale: false,
    });
    await db.update(externalStats).set({ fetchedAt: new Date(0) });
    fetcher.mockRejectedValue(new Error("timeout"));
    expect(await getGithubStats(db, session)).toMatchObject({ value: { stars: 3 }, stale: true });
    await getGithubStats(db, session);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await db
      .update(externalStats)
      .set({ fetchedAt: new Date(Date.now() - 16 * 60000) })
      .where(eq(externalStats.ok, false));
    await getGithubStats(db, session);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(["timeout", "oversized", "invalid", "redirect"])(
    "contains %s external failures",
    async (kind) => {
      if (kind === "timeout")
        fetcher.mockRejectedValue(new DOMException("Expired", "TimeoutError"));
      else
        fetcher.mockResolvedValue(
          kind === "oversized"
            ? new Response(" ".repeat(100001))
            : kind === "invalid"
              ? Response.json({ other: true })
              : new Response(null, { status: 302 }),
        );
      expect(await getGithubStats(db, session)).toEqual({ status: "unavailable" });
    },
  );
});

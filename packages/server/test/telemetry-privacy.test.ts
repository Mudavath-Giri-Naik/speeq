import { LATENCY_BUCKETS_MS, type TelemetryBatch, TelemetryBatchSchema } from "@speeq/core";
import { startSession } from "@speeq/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineContext, type SpeeqConfig } from "../src/index.js";
import { makeSpeeq, userResolver } from "./helpers.js";

/*
 * Privacy contract for server telemetry (docs/reference/telemetry.md, ADR-0004). OWNED BY THE
 * ARCHITECT. The implementer must make this file pass unchanged; do not weaken or delete cases.
 * If a case seems wrong, stop and say so in the report.
 */

const CANARIES = {
  userText: "CANARY_USER_TEXT_8841",
  userId: "user-canary-7731",
  toolArg: "CANARY_TOOL_ARG_5520",
  reply: "CANARY_REPLY_3309",
  providerError: "CANARY_PROVIDER_ERROR_9021",
  pageTitle: "CANARY_PAGE_TITLE_4410",
  origin: "https://canary-origin-6612.example",
  ip: "203.0.113.77",
  routeId: "pricing",
  customTool: "bookmark_question",
  otherTool: "count_questions",
  builtinTool: "search_knowledge",
  agentName: "Helper",
  agentInstructions: "Help the user.",
  knowledgeTitle: "Refunds",
  tenantId: "tenant-canary-6120",
  displayName: "CANARY_DISPLAY_NAME_2291",
  preferredName: "CANARY_PREFERRED_4417",
  contextSource: "canary_source_5511",
  contextData: "CANARY_CONTEXT_8820",
} as const;

/** The test user, with a tenant and an exposed profile (release 0.12 identity fields). */
function canaryUser(request: Request) {
  const user = userResolver(request);
  if (!user) return null;
  return {
    ...user,
    tenantId: CANARIES.tenantId,
    profile: {
      displayName: CANARIES.displayName,
      preferredName: CANARIES.preferredName,
      locale: "te-IN",
    },
  };
}

function capture() {
  const batches: TelemetryBatch[] = [];
  return {
    batches,
    transport: {
      async send(batch: TelemetryBatch) {
        batches.push(structuredClone(batch));
      },
    },
  };
}

/** Every key, at any depth, that appears in the payload. */
function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysOf(v, into);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      keysOf(v, into);
    }
  }
  return into;
}

/** Keys the schema permits besides the `languages` map keys (BCP 47 tags) and error-code keys. */
const ALLOWED_KEYS = new Set([
  "schemaVersion", "instanceId", "projectKey", "sentAt", "events", "type", "ts", "periodStart",
  "periodEnd", "sdkVersions", "runtime", "name", "version", "framework", "features", "navigation",
  "tools", "knowledge", "audit", "confirmations", "store", "llm", "languageCount", "counters",
  "sessions", "turns", "voiceTurns", "textTurns", "toolCalls", "builtin", "custom", "navigations",
  "knowledgeSearches", "requested", "approved", "rejected", "languages", "latencyMs", "total",
  "firstToken", "errors", "@speeq/server",
]); // biome-ignore format: compact list

const LANGUAGE_OR_CODE = /^([a-z]{2,3}(-[A-Za-z0-9]{2,8})*|[A-Z_]+)$/;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("telemetry privacy contract", () => {
  async function richConversation() {
    const { batches, transport } = capture();
    const script = [
      { toolCalls: [{ name: "count_questions", arguments: { subject: CANARIES.toolArg } }] },
      { text: `Answer ${CANARIES.reply}` },
      { toolCalls: [{ name: "navigate", arguments: { routeId: "pricing" } }] },
      { text: "Opening." },
      { toolCalls: [{ name: "search_knowledge", arguments: { query: CANARIES.userText } }] },
      { text: "Found." },
      { toolCalls: [{ name: "bookmark_question", arguments: { questionId: "7" } }] },
      { text: "Saved." },
      { toolCalls: [{ name: "get_context", arguments: { source: CANARIES.contextSource } }] },
      { text: "Context read." },
      { error: new Error(CANARIES.providerError) },
    ];
    const { speeq } = makeSpeeq(script, {
      projectKey: "pk_abcdefgh12345678",
      resolveUser: canaryUser,
      identity: { expose: ["displayName", "preferredName", "locale"] },
      context: {
        page: { allow: ["selected"] },
        providers: [
          defineContext({
            id: CANARIES.contextSource,
            description: "Canary source",
            category: "commerce",
            output: z.object({ items: z.array(z.string()) }),
            expose: ["items"],
            fetch: () => ({ items: [CANARIES.contextData] }),
          }),
        ],
      },
      allowedOrigins: [CANARIES.origin],
      telemetry: { transport, flushIntervalMs: 0 },
    });
    const headers = {
      "x-test-user": CANARIES.userId,
      origin: CANARIES.origin,
      "x-forwarded-for": CANARIES.ip,
    };
    const session = await startSession(speeq.handler, { headers });
    const ctx = { path: "/pricing?secret=CANARY_PATH", title: CANARIES.pageTitle };
    await session.turn(`${CANARIES.userText} count`, { context: ctx });
    await session.turn("go to pricing", { language: "te-IN" });
    await session.turn(`search ${CANARIES.userText}`);
    const events = await session.turn("bookmark 7");
    const pending = events.find((e) => e.type === "confirmation.required");
    if (pending && "confirmationId" in pending) await session.confirm(pending.confirmationId, true);
    await session.turn("my cart please");
    await session.turn("this one fails");
    const probe = await speeq.handler(
      new Request("http://localhost/api/speeq/identity", { headers }),
    );
    const { identity } = (await probe.json()) as { identity: { fingerprint: string } };
    return { batches, session, fingerprint: identity.fingerprint };
  }

  it("sends only schema-valid batches", async () => {
    const { batches } = await richConversation();
    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) expect(TelemetryBatchSchema.safeParse(batch).success).toBe(true);
  });

  it("never contains user content, identifiers, tool or route names, secrets or headers", async () => {
    const { batches, session, fingerprint } = await richConversation();
    const wire = JSON.stringify(batches);
    const forbidden = [
      ...Object.values(CANARIES),
      session.sessionId,
      session.token,
      fingerprint,
      // Identity and personalisation field names (release 0.12) must never appear either.
      "tenantId",
      "profile",
      "fingerprint",
      "identity",
      "displayName",
      "preferredName",
      "locale",
      "test-secret-test-secret", // the signing secret
      "CANARY_PATH",
      "x-test-user",
      "authorization",
      "bearer",
    ];
    for (const needle of forbidden) {
      expect(wire.toLowerCase(), `leaked: ${needle}`).not.toContain(needle.toLowerCase());
    }
  });

  it("only uses allow-listed keys (language tags and error codes are the only dynamic keys)", async () => {
    const { batches } = await richConversation();
    for (const key of keysOf(batches)) {
      if (ALLOWED_KEYS.has(key)) continue;
      expect(key, `unexpected telemetry key: ${key}`).toMatch(LANGUAGE_OR_CODE);
    }
    // sdkVersions keys are package names only.
    for (const b of batches)
      for (const e of b.events)
        if (e.type === "sdk.init")
          for (const k of Object.keys(e.sdkVersions)) expect(k).toMatch(/^@speeq\/[a-z0-9-]+$/);
  });

  it("never contains preferences, resumed transcripts or memory clearing (release 0.12)", async () => {
    const { batches, transport } = capture();
    const preference = "CANARY_PREFERENCE_7342";
    const { speeq } = makeSpeeq(
      [
        {
          toolCalls: [
            {
              name: "remember_preference",
              arguments: { category: "explanation_depth", value: preference },
            },
          ],
        },
        { text: "Saved." },
        { text: `Hello again ${CANARIES.reply}` },
      ],
      {
        projectKey: "pk_abcdefgh12345678",
        resolveUser: canaryUser,
        memory: { mode: "preferences" },
        telemetry: { transport, flushIntervalMs: 0 },
      },
    );
    const headers = { "x-test-user": CANARIES.userId };
    const first = await startSession(speeq.handler, { headers });
    await first.turn(`${CANARIES.userText} keep answers short`);
    const again = await speeq.handler(
      new Request("http://localhost/api/speeq/session", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ language: "en-IN", resume: true }),
      }),
    );
    const resumed = (await again.json()) as { sessionId: string; sessionToken: string };
    const auth = { ...headers, authorization: `Bearer ${resumed.sessionToken}` };
    await speeq.handler(
      new Request(`http://localhost/api/speeq/session/${resumed.sessionId}/messages`, {
        headers: auth,
      }),
    );
    await speeq.handler(
      new Request(`http://localhost/api/speeq/session/${resumed.sessionId}/clear-memory`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: "{}",
      }),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(batches.length).toBeGreaterThan(0);
    const wire = JSON.stringify(batches).toLowerCase();
    for (const needle of [
      preference,
      CANARIES.userText,
      CANARIES.userId,
      CANARIES.tenantId,
      CANARIES.reply,
      first.sessionId,
      "remember_preference",
      "explanation_depth",
      "preference",
      "forgotten",
      "resumed",
      "transcript",
      "clear-memory",
    ])
      expect(wire, `leaked: ${needle}`).not.toContain(needle.toLowerCase());
    for (const batch of batches) expect(TelemetryBatchSchema.safeParse(batch).success).toBe(true);
  });

  it("counts correctly without exposing what was counted", async () => {
    const { batches } = await richConversation();
    const rollups = batches.flatMap((b) => b.events).filter((e) => e.type === "usage.rollup");
    const sum = (pick: (c: (typeof rollups)[number]["counters"]) => number) =>
      rollups.reduce((n, e) => n + pick(e.counters), 0);
    expect(sum((c) => c.sessions)).toBe(1);
    expect(sum((c) => c.turns)).toBe(6);
    expect(sum((c) => c.textTurns)).toBe(6);
    expect(sum((c) => c.voiceTurns)).toBe(0);
    expect(sum((c) => c.navigations)).toBe(1);
    expect(sum((c) => c.knowledgeSearches)).toBe(1);
    expect(sum((c) => c.toolCalls.builtin)).toBe(3); // navigate + search_knowledge + get_context
    expect(sum((c) => c.toolCalls.custom)).toBe(2); // count_questions + bookmark_question
    expect(sum((c) => c.confirmations.requested)).toBe(1);
    expect(sum((c) => c.confirmations.approved)).toBe(1);
    expect(sum((c) => c.confirmations.rejected)).toBe(0);
    const langs = rollups.flatMap((e) => Object.entries(e.counters.languages));
    expect(langs.reduce((n, [, v]) => n + v, 0)).toBe(6);
    expect(new Set(langs.map(([k]) => k))).toEqual(new Set(["en-IN", "te-IN"]));
    const errors = batches.flatMap((b) => b.events).filter((e) => e.type === "error.rollup");
    expect(errors.reduce((n, e) => n + (e.errors.PROVIDER_ERROR ?? 0), 0)).toBe(1);
  });

  it("histograms have one slot per bucket plus overflow and sum to the turn count", async () => {
    const { batches } = await richConversation();
    const rollups = batches.flatMap((b) => b.events).filter((e) => e.type === "usage.rollup");
    for (const e of rollups) {
      expect(e.counters.latencyMs.total).toHaveLength(LATENCY_BUCKETS_MS.length + 1);
      expect(e.counters.latencyMs.firstToken).toHaveLength(LATENCY_BUCKETS_MS.length + 1);
    }
    const total = rollups.reduce(
      (n, e) => n + e.counters.latencyMs.total.reduce((a, b) => a + b, 0),
      0,
    );
    expect(total).toBe(6);
  });

  it("sends sdk.init once per instance with feature flags and no values", async () => {
    const { batches } = await richConversation();
    const inits = batches.flatMap((b) => b.events).filter((e) => e.type === "sdk.init");
    expect(inits).toHaveLength(1);
    expect(inits[0]?.features).toMatchObject({
      navigation: true,
      tools: true,
      knowledge: true,
      audit: false,
      store: "memory",
      llm: "fake",
      languageCount: 3,
    });
    expect(new Set(batches.map((b) => b.instanceId)).size).toBe(1);
    expect(batches.every((b) => b.projectKey === "pk_abcdefgh12345678")).toBe(true);
  });

  it("never sends empty rollups", async () => {
    const { batches, transport } = capture();
    const { speeq } = makeSpeeq([], { telemetry: { transport, flushIntervalMs: 0 } });
    await speeq.handler(new Request("http://localhost/api/speeq/health"));
    expect(batches.flatMap((b) => b.events).filter((e) => e.type !== "sdk.init")).toEqual([]);
  });
});

describe("telemetry switches", () => {
  async function oneTurn(telemetry: NonNullable<SpeeqConfig["telemetry"]>) {
    const { speeq } = makeSpeeq([{ text: "hi" }], { telemetry });
    await (await startSession(speeq.handler)).turn("hello");
  }

  it("sends nothing when disabled in config", async () => {
    const { batches, transport } = capture();
    await oneTurn({ enabled: false, transport, flushIntervalMs: 0 });
    expect(batches).toEqual([]);
  });

  it("sends nothing when SPEEQ_TELEMETRY=0", async () => {
    vi.stubEnv("SPEEQ_TELEMETRY", "0");
    const { batches, transport } = capture();
    await oneTurn({ transport, flushIntervalMs: 0 });
    expect(batches).toEqual([]);
  });

  it("makes no network call when there is no endpoint and no transport", async () => {
    vi.stubEnv("SPEEQ_PLATFORM_URL", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await oneTurn({ flushIntervalMs: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("default transport POSTs JSON to <endpoint>/api/v1/ingest with no credentials or extra headers", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(null, { status: 202 });
    });
    await oneTurn({ endpoint: "http://platform.test/", flushIntervalMs: 0 });
    expect(calls.length).toBeGreaterThan(0);
    const call = calls[0];
    expect(call?.url).toBe("http://platform.test/api/v1/ingest");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.credentials).not.toBe("include");
    const headers = new Headers(call?.init.headers);
    expect([...headers.keys()].sort()).toEqual(["content-type"]);
    expect(TelemetryBatchSchema.safeParse(JSON.parse(String(call?.init.body))).success).toBe(true);
  });
});

describe("telemetry never harms the host app", () => {
  it("a throwing transport does not affect the turn and is not retried with old data", async () => {
    let calls = 0;
    const { speeq } = makeSpeeq([{ text: "one" }, { text: "two" }], {
      telemetry: {
        flushIntervalMs: 0,
        transport: {
          async send() {
            calls++;
            throw new Error("platform down CANARY_DOWN");
          },
        },
      },
    });
    const session = await startSession(speeq.handler);
    const first = await session.turn("a");
    const second = await session.turn("b");
    expect(first.some((e) => e.type === "turn.finished")).toBe(true);
    expect(second.some((e) => e.type === "turn.finished")).toBe(true);
    expect(calls).toBeGreaterThan(0);
  });

  it("a hanging transport is aborted within 2 s and does not delay waitUntil-backed turns", async () => {
    let signal: AbortSignal | undefined;
    const pending: Promise<unknown>[] = [];
    const { speeq } = makeSpeeq([{ text: "hi" }], {
      waitUntil: (p) => void pending.push(p),
      telemetry: {
        flushIntervalMs: 0,
        transport: {
          send: (_batch, options) => {
            signal = options.signal;
            return new Promise(() => undefined); // never settles
          },
        },
      },
    });
    const started = Date.now();
    const events = await (await startSession(speeq.handler)).turn("hello");
    expect(events.some((e) => e.type === "turn.finished")).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000); // not awaited before the response ends
    await Promise.all(pending); // the background flush settles itself via the timeout
    expect(signal?.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it("respects flushIntervalMs: no second send before the interval elapses", async () => {
    const { batches, transport } = capture();
    const { speeq } = makeSpeeq([{ text: "a" }, { text: "b" }, { text: "c" }], {
      telemetry: { transport, flushIntervalMs: 60_000 },
    });
    const session = await startSession(speeq.handler);
    await session.turn("1");
    await session.turn("2");
    await session.turn("3");
    expect(batches.length).toBeLessThanOrEqual(1);
  });
});

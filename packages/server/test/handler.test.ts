import { jsonRequest, startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { createSpeeq } from "../src/index.js";
import { makeSpeeq } from "./helpers.js";

describe("request handler", () => {
  it("routes by path suffix wherever it is mounted", async () => {
    const { speeq } = makeSpeeq([]);
    expect((await speeq.handler(jsonRequest("/health"))).status).toBe(200);
    expect((await speeq.handler(jsonRequest("/deep/mount/speeq/health"))).status).toBe(200);
    expect((await speeq.handler(jsonRequest("/api/speeq/nope"))).status).toBe(404);
    expect(
      (await speeq.handler(jsonRequest("/api/speeq/health", { method: "DELETE" }))).status,
    ).toBe(404);
  });

  it("returns client config on session creation", async () => {
    const { speeq } = makeSpeeq([]);
    const res = await speeq.handler(
      jsonRequest("/api/speeq/session", { body: { language: "hi-IN" } }),
    );
    const body = (await res.json()) as { config: unknown; expiresAt: string };
    expect(body.config).toMatchObject({
      agentName: "Helper",
      languages: ["en-IN", "te-IN", "hi-IN"],
      features: { navigation: true, knowledge: true, tools: true, audit: false },
    });
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("refuses foreign origins and allows listed ones with CORS headers", async () => {
    const { speeq } = makeSpeeq([], { allowedOrigins: ["https://app.example"] });
    const foreign = await speeq.handler(
      jsonRequest("/api/speeq/health", { headers: { origin: "https://evil.example" } }),
    );
    expect(foreign.status).toBe(403);
    const same = await speeq.handler(
      jsonRequest("/api/speeq/health", { headers: { origin: "http://localhost" } }),
    );
    expect(same.status).toBe(200);
    expect(same.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await speeq.handler(
      new Request("http://localhost/api/speeq/session", {
        method: "OPTIONS",
        headers: { origin: "https://app.example" },
      }),
    );
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://app.example");
  });

  it("rejects oversized and malformed bodies", async () => {
    const { speeq } = makeSpeeq([], { guardrails: { maxRequestBytes: 100 } });
    const s = await startSession(speeq.handler);
    const big = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/turn`, {
        body: { text: "x".repeat(500), language: "en-IN" },
        token: s.token,
      }),
    );
    expect(big.status).toBe(400);
    const bad = await speeq.handler(
      new Request("http://localhost/api/speeq/session", {
        method: "POST",
        body: "{nope",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(bad.status).toBe(400);
  });

  it("rate-limits turns per session (best effort) with a retry hint", async () => {
    const { speeq } = makeSpeeq(() => ({ text: "ok" }), {
      guardrails: { rateLimit: { turnsPerMinute: 2 } },
    });
    const s = await startSession(speeq.handler);
    await s.turn("1");
    await s.turn("2");
    const res = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/turn`, {
        body: { text: "3", language: "en-IN" },
        token: s.token,
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).not.toBeNull();
    expect(await res.json()).toMatchObject({ error: { code: "RATE_LIMITED", retryable: true } });
  });

  it("validates configuration at startup", () => {
    const base = makeSpeeq([]);
    expect(base).toBeDefined();
    expect(() =>
      createSpeeq({
        secret: "x".repeat(40),
        agent: { name: "H", instructions: "" },
        llm: { kind: "x", model: "x", stream: async function* () {} },
        store: { kind: "x" } as never,
        tools: [{ name: "navigate", description: "", input: {} as never, handler: () => null }],
      }),
    ).toThrow(/reserved/);
  });
});

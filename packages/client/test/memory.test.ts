import { encodeSse } from "@speeq/core/utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpeeqClient, type IdentitySummary } from "../src/index.js";

/* Client side of ADR-0025 (memory modes). */

const ALICE: IdentitySummary = { state: "authenticated", fingerprint: "fp-alice" };
const MEMORY = { resume: true, clear: true, preferences: false };
const config = {
  agentName: "Helper",
  languages: ["en-IN"],
  defaultLanguage: "en-IN",
  features: { navigation: false, knowledge: false, tools: false, audit: false },
  routes: [],
  memory: MEMORY,
};
const finished = encodeSse(
  "turn.finished",
  JSON.stringify({
    protocolVersion: 1,
    turnId: "t",
    type: "turn.finished",
    reason: "completed",
    latencyMs: 1,
  }),
);

/** A server that continues `resumable` when asked to resume. */
function server(options: { resumable?: string; memory?: typeof MEMORY } = {}) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  let n = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? "GET", body });
    if (url.includes("/identity"))
      return Response.json({
        protocolVersion: 1,
        identity: ALICE,
        memory: options.memory ?? MEMORY,
      });
    if (url.endsWith("/session")) {
      const resumed = body?.resume === true && options.resumable !== undefined;
      const sessionId = resumed ? (options.resumable as string) : `s${++n}`;
      return Response.json({
        sessionId,
        sessionToken: `t-${sessionId}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        config: { ...config, memory: options.memory ?? MEMORY },
        identity: ALICE,
        ...(resumed ? { resumed: true } : {}),
      });
    }
    if (url.endsWith("/messages"))
      return Response.json({
        protocolVersion: 1,
        messages: [
          { role: "user", text: "show DBMS questions", ts: "2026-11-28T10:00:00Z" },
          { role: "assistant", text: "Here are 12.", ts: "2026-11-28T10:00:01Z" },
          { role: "tool", text: "should be ignored", ts: "2026-11-28T10:00:02Z" },
        ],
      });
    if (url.endsWith("/clear-memory"))
      return Response.json({ protocolVersion: 1, sessions: 1, preferences: 0 });
    return new Response(
      encodeSse(
        "assistant.message",
        JSON.stringify({
          protocolVersion: 1,
          turnId: "t",
          type: "assistant.message",
          text: "ok",
          final: true,
        }),
      ) + finished,
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  return { fetch, calls };
}

afterEach(() => vi.restoreAllMocks());

describe("memory in the client", () => {
  it("restores the transcript only when the server continued a conversation", async () => {
    const s = server({ resumable: "old" });
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: s.fetch });
    await client.refreshIdentity();
    expect(client.getSnapshot().memory).toEqual(MEMORY);
    expect(await client.restoreConversation()).toBe(true);
    const snap = client.getSnapshot();
    expect(snap.sessionId).toBe("old");
    expect(snap.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "show DBMS questions"],
      ["assistant", "Here are 12."],
    ]);
    const messagesCall = s.calls.find((c) => c.url.endsWith("/messages"));
    expect(messagesCall?.url).toBe("/api/speeq/session/old/messages");
  });

  it("does not load a transcript for a fresh session", async () => {
    const s = server();
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: s.fetch });
    await client.refreshIdentity();
    expect(await client.restoreConversation()).toBe(false);
    expect(s.calls.some((c) => c.url.endsWith("/messages"))).toBe(false);
  });

  it("never opens a session just to check, when nothing can be continued", async () => {
    const s = server({ memory: { resume: false, clear: false, preferences: false } });
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: s.fetch });
    await client.refreshIdentity();
    expect(await client.restoreConversation()).toBe(false);
    expect(s.calls.some((c) => c.url.endsWith("/session"))).toBe(false);
  });

  it("does not replace messages the user already sees", async () => {
    const s = server({ resumable: "old" });
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: s.fetch });
    await client.sendText("hello");
    expect(await client.restoreConversation()).toBe(false);
    expect(client.getSnapshot().messages[0]?.text).toBe("hello");
  });

  it("asks to resume on first use, but not right after New conversation", async () => {
    const s = server({ resumable: "old" });
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: s.fetch });
    await client.sendText("one");
    client.newConversation();
    await client.sendText("two");
    const creates = s.calls.filter((c) => c.url.endsWith("/session"));
    expect(creates.map((c) => (c.body as { resume?: boolean }).resume)).toEqual([true, undefined]);
    expect(client.getSnapshot().sessionId).toBe("s1");
  });

  it("clearMemory asks the server, then starts fresh without resuming", async () => {
    const s = server({ resumable: "old" });
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: s.fetch });
    await client.sendText("remember this");
    expect(await client.clearMemory()).toBe(true);
    const call = s.calls.find((c) => c.url.endsWith("/clear-memory"));
    expect(call).toMatchObject({ method: "POST", body: { preferences: true } });
    expect(client.getSnapshot().messages).toEqual([]);
    await client.sendText("after");
    const last = s.calls.filter((c) => c.url.endsWith("/session")).at(-1);
    expect((last?.body as { resume?: boolean } | undefined)?.resume).toBeUndefined();
  });

  it("clearMemory reports a refusal and keeps the conversation", async () => {
    const s = server();
    const refuse = vi.fn<typeof globalThis.fetch>(async (input, init) =>
      String(input).endsWith("/clear-memory")
        ? Response.json(
            { error: { code: "FORBIDDEN", message: "off", retryable: false } },
            { status: 403 },
          )
        : s.fetch(input, init),
    );
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: refuse });
    await client.sendText("keep me");
    expect(await client.clearMemory()).toBe(false);
    expect(client.getSnapshot().messages[0]?.text).toBe("keep me");
  });
});

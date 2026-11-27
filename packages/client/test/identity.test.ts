import { encodeSse } from "@speeq/core/utils";
import { FakeSpeechOutput } from "@speeq/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROBE_THROTTLE_MS, watchIdentity } from "../src/identity.js";
import { createSpeeqClient, type IdentitySummary } from "../src/index.js";

/*
 * Client side of ADR-0022. OWNED BY THE ARCHITECT: account isolation cases, do not weaken.
 */

const config = {
  agentName: "Helper",
  languages: ["en-IN"],
  defaultLanguage: "en-IN",
  features: { navigation: false, knowledge: false, tools: true, audit: false },
  routes: [],
};
const ALICE: IdentitySummary = {
  state: "authenticated",
  fingerprint: "fp-alice",
  profile: { preferredName: "Alice" },
};
const BOB: IdentitySummary = { state: "authenticated", fingerprint: "fp-bob" };
const ANON: IdentitySummary = { state: "anonymous", fingerprint: "anonymous" };

function frame(type: string, fields: Record<string, unknown> = {}) {
  return encodeSse(type, JSON.stringify({ protocolVersion: 1, turnId: "turn", type, ...fields }));
}
const finished = frame("turn.finished", { reason: "completed", latencyMs: 2 });
const sse = (text: string) =>
  new Response(text, { headers: { "content-type": "text/event-stream" } });
const errorJson = (code: string, status: number) =>
  Response.json(
    { error: { code, message: code, retryable: code === "AUTH_UNAVAILABLE" } },
    { status },
  );

/** A fake speeq server whose signed-in user the test switches, like a cookie would. */
function fakeServer() {
  const state = { who: ALICE as IdentitySummary, sessions: 0, turnAnswer: null as Response | null };
  const owner = new Map<string, string>();
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/identity"))
      return Response.json({ protocolVersion: 1, identity: state.who });
    if (url.endsWith("/session")) {
      const sessionId = `s${++state.sessions}`;
      owner.set(sessionId, state.who.fingerprint);
      return Response.json({
        sessionId,
        sessionToken: `t-${sessionId}`,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        config,
        identity: state.who,
      });
    }
    const id = /session\/([^/]+)\//.exec(url)?.[1] ?? "";
    if (owner.get(id) !== state.who.fingerprint) return errorJson("IDENTITY_CHANGED", 401);
    if (state.turnAnswer) return state.turnAnswer;
    const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
    return sse(
      frame("assistant.message", {
        text: `reply to ${body.text ?? "?"} as ${state.who.fingerprint}`,
      }) + finished,
    );
  });
  return { state, fetch };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("identity in the client", () => {
  it("learns the identity from the session and emits it", async () => {
    const { fetch } = fakeServer();
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch });
    const seen: IdentitySummary[] = [];
    client.on("identity", (i) => seen.push(i));
    expect(client.getSnapshot().identity).toBeNull();
    await client.sendText("hi");
    expect(client.getSnapshot().identity).toEqual(ALICE);
    expect(seen).toEqual([ALICE]);
  });

  it("customer B in the same browser never sees customer A's conversation", async () => {
    const server = fakeServer();
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: server.fetch });
    await client.sendText("show my cart");
    expect(
      client
        .getSnapshot()
        .messages.map((m) => m.text)
        .join(" "),
    ).toContain("my cart");
    server.state.who = BOB;
    await client.sendText("hello");
    const snap = client.getSnapshot();
    const text = snap.messages.map((m) => m.text).join(" | ");
    expect(text).not.toContain("my cart");
    expect(text).not.toContain("fp-alice");
    expect(text).toContain("reply to hello as fp-bob");
    expect(snap.identity).toEqual(BOB);
    expect(snap.sessionId).toBe("s2");
  });

  it("drops a pending confirmation of the previous identity and never replays it", async () => {
    const server = fakeServer();
    server.state.turnAnswer = sse(
      frame("confirmation.required", {
        confirmationId: "c1",
        toolName: "pay",
        summary: "Pay?",
        args: {},
      }) + finished,
    );
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: server.fetch });
    await client.sendText("pay my bill");
    expect(client.getSnapshot().pendingConfirmation?.confirmationId).toBe("c1");
    server.state.who = BOB;
    server.state.turnAnswer = null;
    await client.confirm("c1", true);
    const snap = client.getSnapshot();
    expect(snap.pendingConfirmation).toBeNull();
    expect(snap.messages).toEqual([]);
    expect(snap.error?.code).toBe("IDENTITY_CHANGED");
    // Only one confirm request went out: it was refused, not retried in a new session.
    const confirms = server.fetch.mock.calls.filter(([u]) => String(u).endsWith("/confirm"));
    expect(confirms).toHaveLength(1);
  });

  it("refreshIdentity resets the conversation when someone else signed in", async () => {
    const server = fakeServer();
    const output = new FakeSpeechOutput();
    const client = createSpeeqClient({
      endpoint: "/api/speeq",
      fetch: server.fetch,
      speech: { output, input: null },
    });
    await client.sendText("my orders");
    server.state.who = ANON; // logged out in another tab
    const identity = await client.refreshIdentity();
    expect(identity).toEqual(ANON);
    const snap = client.getSnapshot();
    expect(snap.messages).toEqual([]);
    expect(snap.sessionId).toBeNull();
    expect(snap.identity).toEqual(ANON);
  });

  it("keeps the conversation when the same user checks again", async () => {
    const server = fakeServer();
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: server.fetch });
    await client.sendText("hi");
    await client.refreshIdentity();
    expect(client.getSnapshot().messages).toHaveLength(2);
    expect(client.getSnapshot().sessionId).toBe("s1");
  });

  it("removes the stored session so a reload cannot pick up the old identity", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
    const server = fakeServer();
    const client = createSpeeqClient({
      endpoint: "/api/speeq",
      fetch: server.fetch,
      persistSession: "sessionStorage",
    });
    await client.sendText("hi");
    expect([...store.keys()]).toHaveLength(1);
    server.state.who = BOB;
    await client.refreshIdentity();
    expect([...store.keys()]).toHaveLength(0);
  });

  it("ignores stream events that arrive after the reset", async () => {
    const server = fakeServer();
    let release: (() => void) | undefined;
    const late = new ReadableStream<Uint8Array>({
      start(controller) {
        release = () => {
          controller.enqueue(
            new TextEncoder().encode(
              frame("assistant.message", { text: "PRIVATE LATE" }) + finished,
            ),
          );
          controller.close();
        };
      },
    });
    server.state.turnAnswer = new Response(late);
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: server.fetch });
    const pending = client.sendText("slow question");
    await vi.waitFor(() => expect(release).toBeDefined());
    server.state.who = BOB;
    server.state.turnAnswer = null;
    await client.refreshIdentity();
    release?.();
    await pending;
    expect(JSON.stringify(client.getSnapshot().messages)).not.toContain("PRIVATE LATE");
  });

  it("keeps the session on AUTH_UNAVAILABLE and shows a retryable error", async () => {
    const server = fakeServer();
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: server.fetch });
    await client.sendText("hi");
    server.state.turnAnswer = errorJson("AUTH_UNAVAILABLE", 503);
    await client.sendText("again");
    const snap = client.getSnapshot();
    expect(snap.error).toMatchObject({ code: "AUTH_UNAVAILABLE", retryable: true });
    expect(snap.sessionId).toBe("s1");
    server.state.turnAnswer = null;
    await client.sendText("third");
    expect(client.getSnapshot().sessionId).toBe("s1");
  });

  it("a failed identity check never resets anything", async () => {
    const server = fakeServer();
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: server.fetch });
    await client.sendText("hi");
    server.fetch.mockImplementationOnce(async () => new Response("nope", { status: 404 }));
    expect(await client.refreshIdentity()).toBeNull();
    expect(client.getSnapshot().messages).toHaveLength(2);
  });
});

describe("watchIdentity", () => {
  it("checks on focus and visibility, throttled, and stops after removal", () => {
    const listeners = new Map<string, () => void>();
    const target = {
      visibilityState: "visible",
      addEventListener: (t: string, f: () => void) => listeners.set(t, f),
      removeEventListener: (t: string) => listeners.delete(t),
    };
    vi.stubGlobal("document", target);
    vi.stubGlobal("window", target);
    let now = 0;
    const check = vi.fn();
    const stop = watchIdentity(check, () => now);
    listeners.get("focus")?.();
    listeners.get("visibilitychange")?.();
    expect(check).toHaveBeenCalledTimes(1);
    now = PROBE_THROTTLE_MS;
    listeners.get("focus")?.();
    expect(check).toHaveBeenCalledTimes(2);
    target.visibilityState = "hidden";
    now = PROBE_THROTTLE_MS * 3;
    listeners.get("visibilitychange")?.();
    expect(check).toHaveBeenCalledTimes(2);
    stop();
    expect(listeners.size).toBe(0);
  });

  it("does not check before a conversation exists", async () => {
    const listeners = new Map<string, () => void>();
    const target = {
      visibilityState: "visible",
      addEventListener: (t: string, f: () => void) => listeners.set(t, f),
      removeEventListener: (t: string) => listeners.delete(t),
    };
    vi.stubGlobal("document", target);
    vi.stubGlobal("window", target);
    const server = fakeServer();
    createSpeeqClient({ endpoint: "/api/speeq", fetch: server.fetch });
    listeners.get("focus")?.();
    await Promise.resolve();
    expect(server.fetch).not.toHaveBeenCalled();
  });
});

describe("greeting and fresh conversations", () => {
  const greeting = {
    text: "Welcome back, Alice!",
    starters: [{ label: "Show my cart", prompt: "Show my cart" }],
    frequency: "once-per-session",
    delayMs: 600,
  };

  it("takes the greeting from the identity check, with the current path", async () => {
    vi.stubGlobal("location", { pathname: "/pricing", search: "?token=abc" });
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ protocolVersion: 1, identity: ALICE, greeting }),
    );
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch });
    await client.refreshIdentity();
    expect(client.getSnapshot().greeting).toEqual(greeting);
    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      `/api/speeq/identity?path=${encodeURIComponent("/pricing?token=[REDACTED]")}`,
    );
  });

  it("ignores a malformed greeting", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ protocolVersion: 1, identity: ALICE, greeting: { text: 5 } }),
    );
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch });
    await client.refreshIdentity();
    expect(client.getSnapshot().greeting).toBeNull();
    expect(client.getSnapshot().identity).toEqual(ALICE);
  });

  it("newConversation clears the transcript and opens a new session for the same person", async () => {
    const server = fakeServer();
    const client = createSpeeqClient({ endpoint: "/api/speeq", fetch: server.fetch });
    await client.sendText("first");
    client.newConversation();
    expect(client.getSnapshot().messages).toEqual([]);
    await client.sendText("second");
    const snap = client.getSnapshot();
    expect(snap.sessionId).toBe("s2");
    expect(snap.messages.map((m) => m.text).join(" ")).not.toContain("first");
    expect(snap.identity).toEqual(ALICE);
  });
});

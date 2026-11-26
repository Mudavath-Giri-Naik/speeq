import { encodeSse } from "@speeq/core/utils";
import { FakeSpeechInput, FakeSpeechOutput } from "@speeq/testing";
import { afterEach, expect, it, vi } from "vitest";
import { createSpeeqClient, type SpeeqClientOptions } from "../src/index.js";

const config = {
  agentName: "Helper",
  languages: ["en-IN", "hi-IN"],
  defaultLanguage: "en-IN",
  features: { navigation: true, knowledge: false, tools: true, audit: true },
  routes: [],
};
const session = () => ({
  sessionId: "s",
  sessionToken: "token",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  config,
});
function frame(type: string, fields: Record<string, unknown> = {}) {
  return encodeSse(type, JSON.stringify({ protocolVersion: 1, turnId: "turn", type, ...fields }));
}
const finished = frame("turn.finished", { reason: "completed", latencyMs: 2 });
function stream(wire: string) {
  const bytes = new TextEncoder().encode(wire);
  let index = 0;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (index === bytes.length) controller.close();
        else controller.enqueue(bytes.subarray(index, ++index));
      },
    }),
  );
}
function setup(
  options: Partial<SpeeqClientOptions> = {},
  reply: () => Response = () => stream(finished),
) {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    String(url).endsWith("/session") ? Response.json(session()) : reply(),
  );
  const client = createSpeeqClient({ endpoint: "/api///", fetch, ...options });
  return { client, fetch };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("constructs a stable, idle snapshot in Node and ignores blank text", async () => {
  const { client, fetch } = setup();
  const initial = client.getSnapshot();
  expect(initial).toEqual({
    state: "idle",
    language: "en-IN",
    languages: ["en-IN"],
    messages: [],
    interimTranscript: "",
    pendingConfirmation: null,
    error: null,
    activeTools: [],
    call: { active: false, interrupted: false },
    support: { speechInput: false, speechOutput: false, voiceForLanguage: null },
    config: null,
    sessionId: null,
    voice: { input: "browser", output: "browser", streaming: "native", processing: "remote" },
  });
  await client.sendText("  ");
  expect(fetch).not.toHaveBeenCalled();
  expect(client.getSnapshot()).toBe(initial);
  const changed = vi.fn();
  const off = client.subscribe(changed);
  await client.sendText("Hi");
  expect(client.getSnapshot()).not.toBe(initial);
  expect(initial.messages).toEqual([]);
  expect(changed).toHaveBeenCalled();
  off();
  changed.mockClear();
  await client.sendText("again");
  expect(changed).not.toHaveBeenCalled();
});

it("assembles fragmented UTF-8, ignores invalid frames, and finalizes each assistant message", async () => {
  const nav = { routeId: "home", href: "/", params: {} };
  const onNavigate = vi.fn(() => {
    throw Error("host");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const wire =
    frame("turn.started") +
    encodeSse("bad", "{") +
    frame("future") +
    encodeSse("bad", '{"protocolVersion":2,"type":"assistant.delta"}') +
    frame("assistant.delta", { text: "हाय" }) +
    frame("assistant.delta", { text: "!" }) +
    frame("assistant.message", { text: "हाय।" }) +
    frame("tool.started", { callId: "c", name: "navigate" }) +
    frame("navigate", nav) +
    frame("tool.finished", { callId: "c" }) +
    frame("assistant.message", { text: "Opened." }) +
    finished;
  const { client, fetch } = setup({ onNavigate }, () => stream(wire));
  const navigate = vi.fn();
  const toolsStarted = vi.fn();
  client.on("navigate", navigate);
  const events: string[] = [],
    states: string[] = [],
    partials: string[] = [];
  client.on("state", (s) => states.push(s));
  client.on("event", (e) => {
    events.push(e.type);
    if (e.type === "assistant.delta")
      partials.push(client.getSnapshot().messages.at(-1)?.text ?? "");
    if (e.type === "tool.started") toolsStarted(client.getSnapshot().activeTools);
  });
  await client.sendText("  go  ");
  expect(partials).toEqual(["हाय", "हाय!"]);
  expect(events).toEqual([
    "turn.started",
    "assistant.delta",
    "assistant.delta",
    "assistant.message",
    "tool.started",
    "navigate",
    "tool.finished",
    "assistant.message",
    "turn.finished",
  ]);
  expect(states).toEqual(["thinking", "idle"]);
  expect(toolsStarted).toHaveBeenCalledExactlyOnceWith([{ callId: "c", name: "navigate" }]);
  expect(client.getSnapshot().messages.map((m) => [m.role, m.status, m.text])).toEqual([
    ["user", "done", "go"],
    ["assistant", "done", "हाय।"],
    ["assistant", "done", "Opened."],
  ]);
  expect(onNavigate).toHaveBeenCalledExactlyOnceWith(nav);
  expect(navigate).toHaveBeenCalledExactlyOnceWith(nav);
  expect(client.getSnapshot().activeTools).toEqual([]);
  expect(fetch.mock.calls[1]).toMatchObject([
    "/api/session/s/turn",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
        accept: "text/event-stream",
      },
    },
  ]);
});

it.each([
  [
    () =>
      Response.json(
        { error: { code: "FORBIDDEN", message: "Denied", retryable: false } },
        { status: 403 },
      ),
    "Denied",
  ],
  [() => new Response("upstream failed", { status: 502 }), "Something went wrong."],
  [
    () => {
      throw Error("offline");
    },
    "Could not reach the assistant. Check your connection.",
  ],
  [() => stream(frame("assistant.delta", { text: "partial" })), "The connection was interrupted."],
] as const)("maps transport failures to a public error", async (reply, message) => {
  const { client } = setup({}, reply);
  const errors = vi.fn();
  client.on("error", errors);
  await client.sendText("go");
  expect(client.getSnapshot()).toMatchObject({ state: "error", error: { message } });
  expect(errors).toHaveBeenCalledTimes(1);
  if (message.includes("interrupted"))
    expect(client.getSnapshot().messages.at(-1)?.status).toBe("error");
});

it.each(["SESSION_EXPIRED", "UNAUTHENTICATED"])(
  "refreshes %s only once and preserves the exact body",
  async (code) => {
    const failure = () =>
      Response.json({ error: { code, message: "expired", retryable: false } }, { status: 401 });
    const { client, fetch } = setup({}, failure);
    if (code === "SESSION_EXPIRED")
      fetch
        .mockImplementationOnce(async () => Response.json(session()))
        .mockImplementationOnce(async () => failure())
        .mockImplementationOnce(async () => Response.json({ ...session(), sessionToken: "new" }))
        .mockImplementationOnce(async () => stream(finished));
    await client.sendText("hello");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/session",
      "/api/session/s/turn",
      "/api/session",
      "/api/session/s/turn",
    ]);
    expect(fetch.mock.calls[1]?.[1]?.body).toBe(fetch.mock.calls[3]?.[1]?.body);
    expect(client.getSnapshot().state).toBe(code === "SESSION_EXPIRED" ? "idle" : "error");
  },
);

it("reuses a stored session, refreshes early, and tolerates corrupt or inaccessible storage", async () => {
  const map = new Map<string, string>();
  const key = "speeq:session:/api";
  const getItem = vi.fn((k: string) => map.get(k) ?? null);
  vi.stubGlobal("sessionStorage", {
    getItem,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  });
  async function countRequests() {
    const { client, fetch } = setup({ persistSession: "sessionStorage" });
    await client.sendText("hi");
    expect(client.getSnapshot().state).toBe("idle");
    return fetch.mock.calls.length;
  }
  expect(await countRequests()).toBe(2);
  expect(JSON.parse(map.get(key) ?? "")).toMatchObject({ sessionToken: "token", config });
  expect(await countRequests()).toBe(1);
  map.set(
    key,
    JSON.stringify({ ...session(), expiresAt: new Date(Date.now() + 29_000).toISOString() }),
  );
  expect(await countRequests()).toBe(2);
  for (const bad of ["{", JSON.stringify({ ...session(), config: {} })]) {
    map.set(key, bad);
    expect(await countRequests()).toBe(2);
  }
  getItem.mockImplementation(() => {
    throw Error("blocked");
  });
  expect(await countRequests()).toBe(2);
});

it("merges host context, falls back on errors, and omits pathless context", async () => {
  vi.stubGlobal("location", { pathname: "/auto", search: "?q=1" });
  vi.stubGlobal("document", { title: "Page" });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { client, fetch } = setup({ getContext: () => ({ path: "/override", data: { id: 2 } }) });
  await client.sendText("go");
  for (const [, init] of fetch.mock.calls)
    expect(JSON.parse(String(init?.body)).context).toEqual({
      path: "/override",
      title: "Page",
      data: { id: 2 },
    });
  const fallback = setup({
    getContext: () => {
      throw Error("host");
    },
  });
  await fallback.client.sendText("go");
  expect(JSON.parse(String(fallback.fetch.mock.calls[1]?.[1]?.body)).context).toEqual({
    path: "/auto?q=1",
    title: "Page",
  });
  expect(log).toHaveBeenCalled();
  vi.unstubAllGlobals();
  const missing = setup({ getContext: () => ({ title: "Only title" }) });
  await missing.client.sendText("go");
  for (const [, init] of missing.fetch.mock.calls)
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("context");
});

it("filters languages, checks voices once, and aborts listening on language change", async () => {
  const input = new FakeSpeechInput(),
    output = new FakeSpeechOutput({ voices: ["hi-IN"] });
  const check = vi.spyOn(output, "hasVoiceFor");
  const { client, fetch } = setup({
    language: "fr",
    languages: ["fr", "hi-IN"],
    speech: { input, output },
  });
  await client.sendText("go");
  expect(client.getSnapshot()).toMatchObject({ language: "en-IN", languages: ["hi-IN"] });
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)).language).toBe("en-IN");
  expect(() => client.setLanguage("fr")).toThrowError(
    expect.objectContaining({ code: "INVALID_INPUT" }),
  );
  client.startListening();
  client.setLanguage("hi-IN");
  expect(input.listening).toBe(false);
  expect(client.getSnapshot().support.voiceForLanguage).toBeNull();
  await vi.waitFor(() => expect(client.getSnapshot().support.voiceForLanguage).toBe(true));
  await client.speak("hi");
  expect(output.spoken).toEqual([{ text: "hi", language: "hi-IN" }]);
  expect(check).toHaveBeenCalledTimes(1);
});

it("captures interim and final voice input with optional automatic sending", async () => {
  const input = new FakeSpeechInput();
  const { client, fetch } = setup({ speech: { input } });
  client.startListening();
  input.partial("hello");
  expect(client.getSnapshot().interimTranscript).toBe("hello");
  client.stopListening();
  await vi.waitFor(() => expect(client.getSnapshot().state).toBe("idle"));
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
    text: "hello",
    inputMode: "voice",
  });
  expect(client.getSnapshot().interimTranscript).toBe("");
  const manual = setup({ speech: { input }, autoSendOnFinal: false });
  manual.client.startListening();
  input.say("draft");
  expect(manual.client.getSnapshot()).toMatchObject({ state: "idle", interimTranscript: "draft" });
  expect(manual.fetch).not.toHaveBeenCalled();
});

it("handles recognition errors and empty recognition sessions", () => {
  const input = new FakeSpeechInput();
  const { client } = setup({ speech: { input } });
  for (const code of ["not-allowed", "no-speech", "network", "aborted"] as const) {
    client.startListening();
    input.fail(code);
    expect(client.getSnapshot().error?.code).toBe(
      {
        "not-allowed": "FORBIDDEN",
        network: "INTERNAL",
        "no-speech": undefined,
        aborted: undefined,
      }[code],
    );
    expect(client.getSnapshot().state).toBe(client.getSnapshot().error ? "error" : "idle");
  }
  client.startListening();
  input.stop();
  expect(client.getSnapshot().state).toBe("idle");
  const unsupported = setup();
  unsupported.client.startListening();
  expect(unsupported.client.getSnapshot()).toMatchObject({
    state: "error",
    error: { code: "NOT_CONFIGURED" },
  });
});

it.each(["disabled", "unsupported", "missing voice"])(
  "silently skips unavailable speech (%s)",
  async (reason) => {
    const output = new FakeSpeechOutput({
      supported: reason !== "unsupported",
      voices: reason === "missing voice" ? [] : ["en-IN"],
    });
    const { client } = setup({ speech: { output }, speakReplies: reason !== "disabled" }, () =>
      stream(
        frame("assistant.delta", { text: "Hello. " }) +
          frame("assistant.message", { text: "Hello." }) +
          finished,
      ),
    );
    const states: string[] = [];
    client.on("state", (s) => states.push(s));
    await client.speak("hello");
    await client.sendText("hello");
    expect(output.spoken).toEqual([]);
    expect(states).toEqual(["thinking", "idle"]);
  },
);

function openReply() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const reply = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: () => new Response(reply),
    send: (data: string) => controller.enqueue(new TextEncoder().encode(data)),
  };
}
it("starts speech before stream completion, serializes sentences and captures the turn language", async () => {
  const output = new FakeSpeechOutput();
  const releases: Array<() => void> = [];
  const speak = output.speak.bind(output);
  vi.spyOn(output, "speak").mockImplementation(async (text, opts) => {
    await speak(text, opts);
    await new Promise<void>((r) => releases.push(r));
  });
  const wire = openReply();
  const { client } = setup({ speech: { output } }, wire.response);
  const turn = client.sendText("go");
  wire.send(frame("assistant.delta", { text: "One. Two" }));
  await vi.waitFor(() => expect(output.spoken).toHaveLength(1));
  expect(client.getSnapshot().state).toBe("speaking");
  client.setLanguage("hi-IN");
  wire.send(
    frame("assistant.message", { text: "One. Two" }) +
      frame("assistant.delta", { text: "Three" }) +
      frame("assistant.message", { text: "Three" }) +
      finished,
  );
  await vi.waitFor(() => expect(client.getSnapshot().messages.at(-1)?.text).toBe("Three"));
  expect(output.spoken).toHaveLength(1);
  releases.shift()?.();
  await vi.waitFor(() => expect(output.spoken).toHaveLength(2));
  releases.shift()?.();
  await vi.waitFor(() => expect(output.spoken).toHaveLength(3));
  releases.shift()?.();
  await turn;
  expect(output.spoken).toEqual(
    ["One.", "Two", "Three"].map((text) => ({ text, language: "en-IN" })),
  );
  expect(client.getSnapshot().state).toBe("idle");
});

it.each(["listen", "send", "cancel", "destroy"])(
  "interrupts an active stream and ignores stale speech on %s",
  async (action) => {
    const output = new FakeSpeechOutput(),
      input = new FakeSpeechInput();
    let release = () => {};
    vi.spyOn(output, "speak").mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
    );
    const wire = openReply();
    const { client, fetch } = setup({ speech: { input, output } }, wire.response);
    const turn = client.sendText("go");
    wire.send(frame("assistant.delta", { text: "First. More" }));
    await vi.waitFor(() => expect(client.getSnapshot().state).toBe("speaking"));
    const signal = fetch.mock.calls[1]?.[1]?.signal;
    if (action === "listen") client.startListening();
    if (action === "send") {
      fetch.mockResolvedValueOnce(stream(finished));
      await client.sendText("next");
    }
    if (action === "cancel") client.cancel();
    if (action === "destroy") client.destroy();
    expect(output.cancelCount).toBeGreaterThan(0);
    expect(signal?.aborted).toBe(true);
    expect(client.getSnapshot().messages[1]?.status).toBe("interrupted");
    release();
    await turn;
    expect(client.getSnapshot()).toMatchObject({
      state: action === "listen" ? "listening" : "idle",
      error: null,
    });
    if (action === "destroy") {
      const snap = client.getSnapshot();
      await client.sendText("ignored");
      await client.confirm("ignored", true);
      await client.speak("ignored");
      client.startListening();
      client.stopListening();
      client.cancel();
      client.setLanguage("ignored");
      client.destroy();
      expect(client.getSnapshot()).toBe(snap);
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  },
);

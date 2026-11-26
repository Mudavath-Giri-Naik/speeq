import { encodeSse } from "@speeq/core/utils";
import { FakeSpeechInput, FakeSpeechOutput } from "@speeq/testing";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSpeeqClient, type SpeeqClientOptions } from "../src/index.js";

const config = {
  agentName: "Helper",
  languages: ["en-US", "hi-IN"],
  defaultLanguage: "en-US",
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
const reply = (text: string) =>
  frame("assistant.delta", { text }) +
  frame("assistant.message", { text }) +
  frame("turn.finished", { reason: "completed", latencyMs: 1 });
function stream(wire: string) {
  const bytes = new TextEncoder().encode(wire);
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  );
}

function setup(
  options: Partial<SpeeqClientOptions> = {},
  speakMs = 0,
  text = "Sure. Here is the answer.",
) {
  const input = new FakeSpeechInput();
  const output = new FakeSpeechOutput({ speakMs });
  const turns: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    if (String(url).endsWith("/session")) return Response.json(session());
    turns.push(String(JSON.parse(String(init?.body)).text));
    return stream(reply(text));
  });
  const client = createSpeeqClient({
    endpoint: "/api",
    fetch,
    speakReplies: false,
    language: "en-US",
    speech: { input, output },
    ...options,
  });
  return { client, input, output, turns, fetch };
}
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("starts a hands-free call that listens continuously and shows words live", async () => {
  const { client, input } = setup();
  client.startCall();
  expect(client.getSnapshot().call).toEqual({ active: true, interrupted: false });
  expect(client.getSnapshot().state).toBe("listening");
  expect(input.starts[0]).toMatchObject({
    continuous: true,
    interimResults: true,
    language: "en-US",
  });
  input.interim("what can");
  expect(client.getSnapshot().interimTranscript).toBe("what can");
  input.interim("what can you do");
  expect(client.getSnapshot().interimTranscript).toBe("what can you do");
});

it("sends each finished phrase, speaks the reply even when replies are off, then keeps listening", async () => {
  const { client, input, output, turns } = setup();
  client.startCall();
  input.final("what can you do");
  await tick();
  await tick();
  expect(turns).toEqual(["what can you do"]);
  expect(output.spoken.map((s) => s.text).join(" ")).toContain("Sure.");
  expect(client.getSnapshot().state).toBe("listening");
  expect(client.getSnapshot().interimTranscript).toBe("");
  // still the same recognition session: a second phrase needs no new start
  input.final("open the quickstart");
  await tick();
  await tick();
  expect(turns).toEqual(["what can you do", "open the quickstart"]);
  expect(input.starts).toHaveLength(1);
});

it("restarts recognition when the browser ends it", async () => {
  const { client, input } = setup();
  client.startCall();
  input.finish();
  expect(input.listening).toBe(false);
  await tick(200);
  expect(input.starts).toHaveLength(2);
  expect(input.listening).toBe(true);
  expect(client.getSnapshot().call.active).toBe(true);
});

it("pauses speech when the visitor talks over it, and resumes if nothing real follows", async () => {
  const { client, input, output } = setup({}, 10_000);
  client.startCall();
  input.final("tell me something");
  await tick();
  await tick();
  expect(client.getSnapshot().state).toBe("speaking");
  const cancelsBefore = output.cancelCount;

  input.interim("hold on");
  expect(output.pauseCount).toBe(1);
  expect(output.paused).toBe(true);
  expect(client.getSnapshot().call.interrupted).toBe(true);
  expect(client.getSnapshot().interimTranscript).toBe("hold on");

  await tick(999);
  expect(output.resumeCount).toBe(0);
  await tick(2);
  expect(output.resumeCount).toBe(1);
  expect(output.paused).toBe(false);
  expect(client.getSnapshot().call.interrupted).toBe(false);
  expect(client.getSnapshot().interimTranscript).toBe("");
  expect(output.cancelCount).toBe(cancelsBefore); // it continued; it did not start over
});

it("keeps speech paused while the visitor keeps talking", async () => {
  const { client, input, output } = setup({}, 10_000);
  client.startCall();
  input.final("tell me something");
  await tick();
  await tick();
  input.interim("wait");
  await tick(800);
  input.interim("wait a moment please");
  await tick(800);
  expect(output.resumeCount).toBe(0);
  expect(client.getSnapshot().call.interrupted).toBe(true);
});

it("stops the assistant and answers the new question when the interruption is real", async () => {
  const { client, input, output, turns } = setup({}, 10_000);
  client.startCall();
  input.final("tell me something");
  await tick();
  await tick();
  input.interim("actually open pricing");
  expect(client.getSnapshot().call.interrupted).toBe(true);
  input.final("actually open pricing");
  await tick();
  await tick();
  expect(output.cancelCount).toBeGreaterThan(0);
  expect(turns).toEqual(["tell me something", "actually open pricing"]);
  expect(client.getSnapshot().call.interrupted).toBe(false);
  await tick(5000);
  expect(output.resumeCount).toBe(0); // the old answer must never resume
});

it("ignores a filler word instead of treating it as a question", async () => {
  const { client, input, output, turns } = setup({}, 10_000);
  client.startCall();
  input.final("tell me something");
  await tick();
  await tick();
  input.interim("um");
  input.final("um");
  await tick(1100);
  expect(turns).toEqual(["tell me something"]);
  expect(output.resumeCount).toBe(1);
});

it("does not interrupt itself when the microphone hears the assistant", async () => {
  const { client, input, output, turns } = setup(
    {},
    10_000,
    "Opening the pricing page for you now.",
  );
  client.startCall();
  input.final("show pricing");
  await tick();
  await tick();
  expect(client.getSnapshot().state).toBe("speaking");
  input.interim("opening the pricing page");
  input.final("opening the pricing page for you");
  await tick(100);
  expect(output.pauseCount).toBe(0);
  expect(turns).toEqual(["show pricing"]);
  expect(client.getSnapshot().interimTranscript).toBe("");
});

it("can turn the echo guard off", async () => {
  const { client, input, output } = setup(
    { call: { echoGuard: false } },
    10_000,
    "Opening the pricing page for you now.",
  );
  client.startCall();
  input.final("show pricing");
  await tick();
  await tick();
  input.interim("opening the pricing page");
  expect(output.pauseCount).toBe(1);
});

it("stops speech at once when the output cannot pause", async () => {
  const input = new FakeSpeechInput();
  const output = new FakeSpeechOutput({ speakMs: 10_000 });
  (output as { pause?: unknown }).pause = undefined;
  (output as { resume?: unknown }).resume = undefined;
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    String(url).endsWith("/session")
      ? Response.json(session())
      : stream(reply("A long answer here.")),
  );
  const client = createSpeeqClient({
    endpoint: "/api",
    fetch,
    language: "en-US",
    speech: { input, output },
  });
  client.startCall();
  input.final("hello");
  await tick();
  await tick();
  input.interim("stop please");
  expect(output.cancelCount).toBeGreaterThan(0);
  expect(client.getSnapshot().state).toBe("listening");
});

it("sends a phrase early when commitAfterMs is set, and ignores the browser's late duplicate", async () => {
  const { client, input, turns } = setup({ call: { commitAfterMs: 500 } });
  client.startCall();
  input.interim("what is speeq");
  await tick(499);
  expect(turns).toEqual([]);
  await tick(2);
  await tick();
  expect(turns).toEqual(["what is speeq"]);
  input.final("What is speeq");
  await tick();
  await tick();
  expect(turns).toEqual(["what is speeq"]);
});

it("restarts the early-send timer when new words arrive", async () => {
  const { client, input, turns } = setup({ call: { commitAfterMs: 500 } });
  client.startCall();
  input.interim("what is");
  await tick(400);
  input.interim("what is speeq");
  await tick(400);
  expect(turns).toEqual([]);
  await tick(200);
  await tick();
  expect(turns).toEqual(["what is speeq"]);
});

it("ends the call: stops listening and speaking and turns speech replies back off", async () => {
  const { client, input, output } = setup({}, 10_000);
  client.startCall();
  input.final("hello");
  await tick();
  await tick();
  expect(client.getSnapshot().state).toBe("speaking");
  client.endCall();
  expect(client.getSnapshot().call).toEqual({ active: false, interrupted: false });
  expect(client.getSnapshot().state).toBe("idle");
  expect(input.listening).toBe(false);
  expect(output.cancelCount).toBeGreaterThan(0);
  await tick(500);
  expect(input.starts).toHaveLength(1); // no restart after the call ended
  await client.sendText("typed after the call");
  await tick();
  expect(output.spoken.map((s) => s.text).join(" ")).not.toContain("typed");
});

it("ends the call with a clear error when the microphone is blocked", async () => {
  const { client, input } = setup();
  client.startCall();
  input.fail("not-allowed");
  const snap = client.getSnapshot();
  expect(snap.call.active).toBe(false);
  expect(snap.state).toBe("error");
  expect(snap.error?.code).toBe("FORBIDDEN");
  await tick(500);
  expect(input.starts).toHaveLength(1);
});

it("gives up with an error when recognition keeps failing", async () => {
  const { client, input } = setup();
  client.startCall();
  for (let i = 0; i < 12 && client.getSnapshot().call.active; i++) {
    input.finish();
    await tick(600);
  }
  expect(client.getSnapshot().call.active).toBe(false);
  expect(client.getSnapshot().error?.code).toBe("INTERNAL");
});

it("reports unsupported browsers instead of starting a call", () => {
  const input = new FakeSpeechInput({ supported: false });
  const client = createSpeeqClient({
    endpoint: "/api",
    speech: { input, output: new FakeSpeechOutput() },
  });
  client.startCall();
  expect(client.getSnapshot().call.active).toBe(false);
  expect(client.getSnapshot().error?.code).toBe("NOT_CONFIGURED");
});

it("speaking a greeting during a call keeps the microphone on", async () => {
  const { client, input, output } = setup();
  client.startCall();
  await client.speak("Hi, I can open any page.");
  expect(output.spoken.map((s) => s.text)).toContain("Hi, I can open any page.");
  expect(input.listening).toBe(true);
  expect(client.getSnapshot().state).toBe("listening");
});

it("typing during a call still works and keeps the call alive", async () => {
  const { client, turns } = setup();
  client.startCall();
  await client.sendText("typed question");
  await tick();
  expect(turns).toEqual(["typed question"]);
  expect(client.getSnapshot().call.active).toBe(true);
  expect(client.getSnapshot().state).toBe("listening");
});

it("ignores single-utterance listening while a call is running", () => {
  const { client, input } = setup();
  client.startCall();
  client.startListening();
  expect(input.starts).toHaveLength(1);
  client.stopListening(); // stopping the microphone ends the call
  expect(client.getSnapshot().call.active).toBe(false);
});

it("changes recognition language during a call", async () => {
  const { client, input } = setup({ languages: ["en-US", "hi-IN"] });
  await client.sendText("warm up the session");
  await tick();
  client.startCall();
  client.setLanguage("hi-IN");
  await tick(300);
  expect(input.starts.at(-1)?.language).toBe("hi-IN");
});

// ---- Voice detection from the microphone level, and transcript fixes ----

function fakeMonitor() {
  const state = {
    handlers: undefined as undefined | { onVoice(): void; isPlaying(): boolean },
    level: 0,
    stopped: 0,
  };
  const create: NonNullable<NonNullable<SpeeqClientOptions["call"]>["createMicMonitor"]> = (
    handlers,
  ) => {
    state.handlers = handlers;
    return {
      start: async () => true,
      stop: () => {
        state.stopped++;
      },
      level: () => state.level,
    };
  };
  return { state, create };
}

it("pauses the greeting the moment the microphone hears a voice, before any words are recognised", async () => {
  const mon = fakeMonitor();
  const { client, output } = setup({ call: { createMicMonitor: mon.create } }, 5000);
  client.startCall();
  void client.speak("Hi, I am the guide. I can open any page.");
  await tick(300);
  expect(client.getSnapshot().state).toBe("speaking");
  expect(mon.state.handlers?.isPlaying()).toBe(true);
  mon.state.handlers?.onVoice(); // a quiet voice: no recognised words yet
  expect(output.pauseCount).toBe(1);
  expect(client.getSnapshot().call.interrupted).toBe(true);
});

it("resumes the greeting after the grace time when the voice was only noise", async () => {
  const mon = fakeMonitor();
  const { client, output } = setup({ call: { createMicMonitor: mon.create } }, 5000);
  client.startCall();
  void client.speak("Hi, I am the guide. I can open any page.");
  await tick(300);
  mon.state.handlers?.onVoice();
  await tick(1100);
  expect(output.resumeCount).toBe(1);
  expect(client.getSnapshot().call.interrupted).toBe(false);
});

it("keeps the greeting paused while the voice continues, then answers the new words", async () => {
  const mon = fakeMonitor();
  const { client, output, input, turns } = setup({ call: { createMicMonitor: mon.create } }, 5000);
  client.startCall();
  void client.speak("Hi, I am the guide. I can open any page.");
  await tick(300);
  for (let i = 0; i < 4; i++) {
    mon.state.handlers?.onVoice();
    await tick(600);
  }
  expect(output.resumeCount).toBe(0); // kept talking, so it stayed paused
  input.final("open the install page");
  await tick(50);
  expect(turns).toEqual(["open the install page"]);
});

it("ignores the microphone monitor when voice detection is off", async () => {
  const mon = fakeMonitor();
  const { client } = setup({ call: { voiceDetection: false, createMicMonitor: mon.create } });
  client.startCall();
  expect(mon.state.handlers).toBeUndefined();
});

it("reports the mic level during a call and zero otherwise, and stops the monitor on end", async () => {
  const mon = fakeMonitor();
  const { client } = setup({ call: { createMicMonitor: mon.create } });
  expect(client.getMicLevel()).toBe(0);
  client.startCall();
  await tick(0);
  mon.state.level = 0.6;
  expect(client.getMicLevel()).toBe(0.6);
  client.endCall();
  expect(mon.state.stopped).toBe(1);
  expect(client.getMicLevel()).toBe(0);
});

it("fixes recognition mistakes before showing and sending the words", async () => {
  const { client, input, turns } = setup({
    call: { correct: (t) => t.replace(/\bspeak\b/gi, "speeq") },
  });
  client.startCall();
  input.interim("how does speak work");
  expect(client.getSnapshot().interimTranscript).toBe("how does speeq work");
  input.final("how does speak work");
  await tick(50);
  expect(turns).toEqual(["how does speeq work"]);
});

it("keeps working when the fixer throws", async () => {
  const { client, input, turns } = setup({
    call: {
      correct: () => {
        throw new Error("boom");
      },
    },
  });
  client.startCall();
  input.final("hello there");
  await tick(50);
  expect(turns).toEqual(["hello there"]);
});

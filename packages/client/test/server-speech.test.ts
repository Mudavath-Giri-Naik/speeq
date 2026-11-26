import { expect, it, vi } from "vitest";
import { Endpointing } from "../src/endpointing.js";
import { PreRoll } from "../src/pcm-capture.js";
import { ServerSpeechInput } from "../src/server-speech-input.js";
import { ServerSpeechOutput } from "../src/server-speech-output.js";
import { sessions } from "../src/session.js";
import { SpeechQueue } from "../src/speech-queue.js";
import { encodeWav, resample } from "../src/wav.js";

it("preserves short pauses, ends on silence and caps repeated utterances", () => {
  const d = new Endpointing({
    voiceHoldMs: 10,
    minUtteranceMs: 10,
    maxUtteranceMs: 100,
    endpointMs: 40,
  });
  const times = [0, 10, 20, 50, 55, 65, 105, 110, 120, 210];
  const levels = [1, 1, 0, 0, 1, 0, 0, 1, 1, 1];
  expect(times.map((now, i) => d.push({ now, rms: levels[i] ?? 0 }))).toEqual([
    null,
    "speechStart",
    null,
    null,
    null,
    null,
    "speechEnd",
    null,
    "speechStart",
    "speechEnd",
  ]);
});
it("retains recent samples, resamples and clips WAV", () => {
  const ring = new PreRoll(3);
  ring.push(Float32Array.of(0, 1, 2, 3));
  expect([...ring.take()]).toEqual([1, 2, 3]);
  expect([...resample(Float32Array.of(1, 2, 3, 4), 32000)]).toEqual([1, 3]);
  const bytes = encodeWav(Float32Array.of(-2, 2));
  const v = new DataView(bytes.buffer);
  expect(bytes.length).toBe(48);
  expect(v.getUint32(24, true)).toBe(16000);
  expect(v.getInt16(44, true)).toBe(-32768);
  expect(v.getInt16(46, true)).toBe(32767);
});
it.each(["quiet", "stop", "abort", "continuous", "denied", "failed"])(
  "handles capture %s",
  async (mode) => {
    const post = vi.fn(async () => {
      if (mode === "failed") throw Error();
      return Response.json({ text: "ok" });
    });
    let frame: (s: Float32Array, r: number) => void = () => {};
    const input = new ServerSpeechInput(post, 100, async (cb) => {
      if (mode === "denied") throw new DOMException("denied", "NotAllowedError");
      frame = cb;
    });
    const final = vi.fn(),
      error = vi.fn();
    let done = () => {};
    const ended = new Promise<void>((resolve) => {
      done = resolve;
    });
    input.start(
      { language: "en", continuous: mode === "continuous" },
      { onFinal: final, onError: error, onEnd: done },
    );
    const emit = (n: number, level: number) => {
      for (let i = 0; i < n; i++) frame(new Float32Array(640).fill(level), 16000);
    };
    emit(10, mode === "quiet" ? 0 : 0.25);
    if (mode === "abort") input.abort();
    else if (mode !== "denied") {
      if (mode === "continuous") {
        emit(8, 0);
        emit(10, 0.25);
      }
      input.stop();
    }
    await ended;
    expect(post).toHaveBeenCalledTimes(
      mode === "continuous" ? 2 : ["abort", "denied", "quiet"].includes(mode) ? 0 : 1,
    );
    if (mode === "denied" || mode === "failed" || mode === "quiet")
      expect(error.mock.calls[0]?.[0].code).toBe(
        mode === "denied" ? "not-allowed" : mode === "quiet" ? "no-speech" : "network",
      );
    expect(final).toHaveBeenCalledTimes(mode === "continuous" ? 2 : mode === "stop" ? 1 : 0);
  },
);
it("reuses decoded sentences, pauses playback, cancels prefetch and falls back", async () => {
  const fallback = {
    supported: true,
    hasVoiceFor: async () => true,
    speak: vi.fn(),
    cancel: vi.fn(),
  };
  const signals: AbortSignal[] = [];
  const post = vi.fn(
    async (_path: string, _lang: string, _init: RequestInit, signal: AbortSignal) => {
      signals.push(signal);
      if (signals.length === 3) throw Error();
      return new Response(new Uint8Array(4));
    },
  );
  const src = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  };
  const ctx = {
    decodeAudioData: vi.fn(async () => ({})),
    createBufferSource: () => src,
    suspend: vi.fn(),
    resume: vi.fn(),
  };
  const out = new ServerSpeechOutput(post, fallback, () => ctx as unknown as AudioContext);
  const o = { language: "en" };
  out.prepare("a", o);
  const playing = out.speak("a", o);
  await vi.waitFor(() => expect(src.start).toHaveBeenCalledOnce());
  out.pause();
  out.resume();
  src.onended?.();
  await playing;
  expect(post).toHaveBeenCalledOnce();
  expect(ctx.suspend).toHaveBeenCalledOnce();
  expect(ctx.resume).toHaveBeenCalledOnce();
  out.prepare("b", o);
  out.cancel();
  expect(signals[1]?.aborted).toBe(true);
  await out.speak("b", o);
  expect(fallback.speak).toHaveBeenCalledWith("b", o);
});
it("prepares each enqueued sentence immediately and speaks in order", async () => {
  const output = {
    supported: true,
    hasVoiceFor: async () => true,
    prepare: vi.fn(),
    speak: vi.fn(),
    cancel: vi.fn(),
  };
  const q = new SpeechQueue(output, true);
  void q.enqueue("first", "en", () => {});
  void q.enqueue("second", "en", () => {});
  expect(output.prepare.mock.calls.map((c) => c[0])).toEqual(["first", "second"]);
  await q.drain();
  expect(output.speak.mock.calls.map((c) => c[0])).toEqual(["first", "second"]);
});

it("shares session establishment across overlapping speech requests", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      sessionId: "one",
      sessionToken: "token",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      config: {
        agentName: "Test",
        languages: ["en"],
        defaultLanguage: "en",
        features: { tools: false, navigation: false, knowledge: false, audit: false },
        routes: [],
      },
    }),
  );
  const request = sessions({ fetch, endpoint: "/speeq" }, () => {});
  const send = vi.fn(async () => new Response());
  await Promise.all(
    [1, 2, 3].map(() => request(send, "en", () => undefined, new AbortController().signal)),
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledTimes(3);
});
it("drops a click or cough instead of sending it for recognition", async () => {
  const post = vi.fn(async () => Response.json({ text: "ok" }));
  let frame: (s: Float32Array, r: number) => void = () => {};
  const input = new ServerSpeechInput(post, 100, async (cb) => {
    frame = cb;
  });
  const final = vi.fn();
  input.start({ language: "te", continuous: true }, { onFinal: final });
  const emit = (n: number, level: number) => {
    for (let i = 0; i < n; i++) frame(new Float32Array(640).fill(level), 16000);
  };
  emit(4, 0.25); // about 160 ms of sound
  emit(10, 0);
  emit(12, 0.25); // then real speech, about half a second
  emit(10, 0);
  await vi.waitFor(() => expect(final).toHaveBeenCalledOnce());
  expect(post).toHaveBeenCalledTimes(1);
  input.abort();
});

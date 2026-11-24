import { afterEach, expect, it, vi } from "vitest";
import { detectSpeechSupport, WebSpeechOutput } from "../src/index.js";
import type { SpeechSynthesisVoiceLike, UtteranceLike } from "../src/web-speech-types.js";

function voice(
  lang: string,
  name = lang,
  preferred = false,
  local = false,
): SpeechSynthesisVoiceLike {
  return { lang, name, default: preferred, localService: local, voiceURI: name };
}
class Utterance implements UtteranceLike {
  constructor(readonly text: string) {}
  lang = "";
  voice = null;
  rate = 0;
  pitch = 0;
  onend: UtteranceLike["onend"] = null;
  onerror: UtteranceLike["onerror"] = null;
}
function setup(...initial: SpeechSynthesisVoiceLike[]) {
  const events = new EventTarget();
  const synth = {
    voices: initial,
    paused: false,
    resume: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn<(u: UtteranceLike) => void>(),
    getVoices: () => synth.voices,
    addEventListener: vi.fn(events.addEventListener.bind(events)),
    removeEventListener: vi.fn(events.removeEventListener.bind(events)),
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  return { synth, events };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("requires synthesis and utterances and detects changes after construction", async () => {
  const output = new WebSpeechOutput();
  vi.stubGlobal("speechSynthesis", undefined);
  expect(output.supported).toBe(false);
  setup(voice("en"));
  expect(output.supported).toBe(true);
  expect(detectSpeechSupport().output).toBe(true);
  vi.stubGlobal("SpeechSynthesisUtterance", undefined);
  expect(output.supported).toBe(false);
  expect(await output.hasVoiceFor("en")).toBe(false);
  await output.speak("test", { language: "en" });
});
it("normalizes tags, prefers exact default/local voices and re-reads available voices", async () => {
  const selected = voice("en-IN", "preferred local", true, true);
  const { synth } = setup(
    voice("en"),
    voice("en_IN", "local", false, true),
    voice("EN-in", "default", true),
    selected,
    voice("te"),
  );
  const output = new WebSpeechOutput({ rate: 1.3, pitch: 0.8 });
  expect(await output.hasVoiceFor("te-IN")).toBe(true);
  expect(await output.hasVoiceFor("hi-IN")).toBe(false);
  synth.paused = true;
  const spoken = output.speak("hello", { language: "en_IN" });
  await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(1));
  const u = synth.speak.mock.calls[0]?.[0];
  expect(u).toMatchObject({ lang: "en_IN", text: "hello", voice: selected, rate: 1.3, pitch: 0.8 });
  expect(synth.resume.mock.invocationCallOrder[0]).toBeLessThan(
    Number(synth.speak.mock.invocationCallOrder[0]),
  );
  u?.onend?.();
  await spoken;
  synth.voices = [voice("hi")];
  expect(await output.hasVoiceFor("hi-IN")).toBe(true);
});
it("shares an empty-list wait and reads voices again after voiceschanged", async () => {
  const { synth, events } = setup();
  const output = new WebSpeechOutput();
  const results = Promise.all([output.hasVoiceFor("te-IN"), output.hasVoiceFor("hi-IN")]);
  expect(synth.addEventListener).toHaveBeenCalledTimes(1);
  synth.voices = [voice("te")];
  events.dispatchEvent(new Event("voiceschanged"));
  expect(await results).toEqual([true, false]);
  expect(synth.removeEventListener).toHaveBeenCalledTimes(1);
});
it.each([
  [20, 20],
  [5000, 1500],
])("bounds the wait for voices (%i ms)", async (configured, expected) => {
  vi.useFakeTimers();
  const { synth } = setup();
  const output = new WebSpeechOutput({ voicesTimeoutMs: configured });
  const result = output.hasVoiceFor("en");
  await vi.advanceTimersByTimeAsync(expected - 1);
  expect(synth.removeEventListener).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBe(false);
  expect(synth.removeEventListener).toHaveBeenCalledTimes(1);
});
it("supports voice overrides, fallback and resolving utterance errors", async () => {
  const en = voice("en"),
    te = voice("te");
  const { synth } = setup(en, te);
  const selectVoice = vi.fn().mockReturnValueOnce(te).mockReturnValueOnce(undefined);
  const output = new WebSpeechOutput({ selectVoice });
  for (const [i, expected] of [te, en].entries()) {
    const done = output.speak("message", { language: "en" });
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(i + 1));
    const u = synth.speak.mock.calls[i]?.[0];
    expect(u).toMatchObject({ voice: expected, pitch: 1, rate: 1 });
    u?.onerror?.();
    await done;
  }
  expect(selectVoice).toHaveBeenCalledWith("en", [en, te]);
});
it("skips aborted signals and cancels all pending speech on abort or explicit cancellation", async () => {
  const { synth } = setup(voice("en"));
  const output = new WebSpeechOutput();
  await output.speak("skip", { language: "en", signal: AbortSignal.abort() });
  expect(synth.speak).not.toHaveBeenCalled();
  const controller = new AbortController();
  const a = output.speak("one", { language: "en", signal: controller.signal });
  const b = output.speak("two", { language: "en" });
  await vi.waitFor(() => expect(synth.speak).toHaveBeenCalledTimes(2));
  controller.abort();
  await Promise.all([a, b]);
  expect(synth.cancel).toHaveBeenCalledTimes(1);
  const c = output.speak("three", { language: "en" });
  output.cancel();
  await c;
  expect(synth.cancel).toHaveBeenCalledTimes(2);
  expect(synth.speak).toHaveBeenCalledTimes(2);
});

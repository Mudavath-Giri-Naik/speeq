import { afterEach, expect, it, vi } from "vitest";
import { WebSpeechInput, WebSpeechOutput } from "../src/index.js";
import type { RecognitionLike } from "../src/web-speech-types.js";

class Recognition implements RecognitionLike {
  static instances: Recognition[] = [];
  constructor() {
    Recognition.instances.push(this);
  }
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: RecognitionLike["onresult"] = null;
  onerror: RecognitionLike["onerror"] = null;
  onend: RecognitionLike["onend"] = null;
  onspeechstart: RecognitionLike["onspeechstart"] = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  result(...entries: [boolean, string][]) {
    this.onresult?.({
      results: entries.map(([isFinal, transcript]) => ({ length: 1, 0: { transcript }, isFinal })),
    });
  }
}
function setup(options: { continuous?: boolean } = { continuous: true }) {
  vi.stubGlobal("SpeechRecognition", Recognition);
  const input = new WebSpeechInput();
  const handlers = {
    onFinal: vi.fn(),
    onInterim: vi.fn(),
    onEnd: vi.fn(),
    onError: vi.fn(),
    onSpeechStart: vi.fn(),
  };
  input.start({ language: "en-US", ...options }, handlers);
  const rec = Recognition.instances.at(-1) as Recognition;
  return { input, rec, handlers };
}
afterEach(() => {
  vi.unstubAllGlobals();
  Recognition.instances = [];
});

it("asks the browser for continuous recognition only when requested", () => {
  expect(setup().rec.continuous).toBe(true);
  expect(setup({}).rec.continuous).toBe(false);
});

it("delivers every finished phrase once while recognition keeps running", () => {
  const { rec, handlers } = setup();
  rec.result([false, "hello"]);
  expect(handlers.onInterim).toHaveBeenLastCalledWith("hello");
  rec.result([true, "hello there"]);
  expect(handlers.onFinal).toHaveBeenCalledTimes(1);
  expect(handlers.onFinal).toHaveBeenLastCalledWith("hello there");
  // the browser repeats earlier results in the list; they must not be delivered again
  rec.result([true, "hello there"], [false, "open"]);
  expect(handlers.onFinal).toHaveBeenCalledTimes(1);
  expect(handlers.onInterim).toHaveBeenLastCalledWith("open");
  rec.result([true, "hello there"], [true, " open pricing"]);
  expect(handlers.onFinal).toHaveBeenCalledTimes(2);
  expect(handlers.onFinal).toHaveBeenLastCalledWith("open pricing");
  expect(handlers.onEnd).not.toHaveBeenCalled();
});

it("does not deliver a final at the end of a continuous session", () => {
  const { rec, handlers } = setup();
  rec.result([true, "done"]);
  rec.onend?.();
  expect(handlers.onFinal).toHaveBeenCalledTimes(1);
  expect(handlers.onEnd).toHaveBeenCalledTimes(1);
});

it("reports when speech starts", () => {
  const { rec, handlers } = setup();
  rec.onspeechstart?.();
  expect(handlers.onSpeechStart).toHaveBeenCalledTimes(1);
});

it("keeps the single-utterance behavior by default", () => {
  const { rec, handlers } = setup({});
  rec.result([true, "one shot"]);
  expect(handlers.onFinal).not.toHaveBeenCalled();
  rec.onend?.();
  expect(handlers.onFinal).toHaveBeenCalledWith("one shot");
});

it("pauses and resumes browser speech", () => {
  const synth = { paused: false, pause: vi.fn(), resume: vi.fn(), cancel: vi.fn() };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", class {});
  const output = new WebSpeechOutput();
  output.pause();
  output.resume();
  expect(synth.pause).toHaveBeenCalledTimes(1);
  expect(synth.resume).toHaveBeenCalledTimes(1);
});

it("does not fail when the browser cannot pause", () => {
  vi.stubGlobal("speechSynthesis", { paused: false, resume: vi.fn(), cancel: vi.fn() });
  vi.stubGlobal("SpeechSynthesisUtterance", class {});
  expect(() => new WebSpeechOutput().pause()).not.toThrow();
});

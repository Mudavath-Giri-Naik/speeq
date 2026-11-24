import { afterEach, expect, it, vi } from "vitest";
import { detectSpeechSupport, WebSpeechInput } from "../src/index.js";
import type { RecognitionLike } from "../src/web-speech-types.js";

class Recognition implements RecognitionLike {
  static instances: Recognition[] = [];
  constructor() {
    Recognition.instances.push(this);
  }
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onresult: RecognitionLike["onresult"] = null;
  onerror: RecognitionLike["onerror"] = null;
  onend: RecognitionLike["onend"] = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  result(...entries: [boolean, string][]) {
    this.onresult?.({
      results: entries.map(([isFinal, transcript]) => ({ length: 1, 0: { transcript }, isFinal })),
    });
  }
}
function setup() {
  vi.stubGlobal("SpeechRecognition", Recognition);
  const input = new WebSpeechInput();
  const handlers = { onFinal: vi.fn(), onInterim: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
  input.start({ language: "te-IN" }, handlers);
  const rec = Recognition.instances.at(-1);
  if (!rec) throw Error("Recognition did not start");
  return { input, rec, handlers };
}
afterEach(() => {
  vi.unstubAllGlobals();
  Recognition.instances = [];
});
it("detects native and prefixed recognition lazily and handles missing recognition", () => {
  const input = new WebSpeechInput();
  vi.stubGlobal("SpeechRecognition", undefined);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
  expect(input.supported).toBe(false);
  const handlers = { onFinal: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
  input.start({ language: "en" }, handlers);
  expect(handlers.onError).toHaveBeenCalledWith(expect.objectContaining({ code: "unsupported" }));
  expect(handlers.onEnd).toHaveBeenCalledTimes(1);
  vi.stubGlobal("webkitSpeechRecognition", Recognition);
  expect(detectSpeechSupport().input).toBe(true);
  input.start({ language: "en" }, handlers);
  expect(Recognition.instances).toHaveLength(1);
  vi.stubGlobal("SpeechRecognition", Recognition);
  vi.stubGlobal(
    "webkitSpeechRecognition",
    class {
      constructor() {
        throw Error("wrong constructor");
      }
    },
  );
  input.start({ language: "en" }, handlers);
  expect(Recognition.instances).toHaveLength(2);
});
it("delivers changed interim text, then one trimmed final transcript at end after stop", () => {
  const { input, rec, handlers } = setup();
  expect(rec).toMatchObject({
    lang: "te-IN",
    interimResults: true,
    continuous: false,
    maxAlternatives: 1,
  });
  rec.result([false, "one "], [false, "two"]);
  rec.result([false, "one "], [false, "two"]);
  expect(handlers.onInterim).toHaveBeenCalledExactlyOnceWith("one two");
  rec.result([true, " one "], [false, "three"]);
  input.stop();
  expect(rec.stop).toHaveBeenCalledTimes(1);
  rec.result([true, " one "], [true, "three "]);
  expect(handlers.onFinal).not.toHaveBeenCalled();
  rec.onend?.();
  rec.onend?.();
  expect(handlers.onFinal).toHaveBeenCalledExactlyOnceWith("one three");
  expect(handlers.onEnd).toHaveBeenCalledTimes(1);
  expect(handlers.onFinal.mock.invocationCallOrder[0]).toBeLessThan(
    Number(handlers.onEnd.mock.invocationCallOrder[0]),
  );
});
it("aborts a replaced recognition and ignores its late callbacks", () => {
  const { input, rec, handlers } = setup();
  rec.result([true, "discard"]);
  const next = { onFinal: vi.fn(), onEnd: vi.fn() };
  input.start({ language: "hi-IN", interimResults: false }, next);
  rec.onend?.();
  rec.result([true, "late"]);
  expect(rec.abort).toHaveBeenCalledTimes(1);
  expect(handlers.onFinal).not.toHaveBeenCalled();
  expect(handlers.onEnd).toHaveBeenCalledTimes(1);
  const second = Recognition.instances[1];
  expect(second).toMatchObject({ lang: "hi-IN", interimResults: false });
  second?.result([true, "discard too"]);
  input.abort();
  second?.onend?.();
  expect(second?.abort).toHaveBeenCalledTimes(1);
  expect(next.onFinal).not.toHaveBeenCalled();
  expect(next.onEnd).toHaveBeenCalledTimes(1);
});
it.each([
  ["not-allowed", "not-allowed"],
  ["service-not-allowed", "not-allowed"],
  ["no-speech", "no-speech"],
  ["network", "network"],
  ["aborted", "aborted"],
  ["language-not-supported", "unsupported"],
  ["audio-capture", "other"],
])("maps %s to %s", (error, code) => {
  const { rec, handlers } = setup();
  const message = error === "network" ? "Network offline" : "";
  rec.onerror?.({ error, message });
  rec.onend?.();
  rec.onend?.();
  expect(handlers.onError).toHaveBeenCalledExactlyOnceWith({ code, message: message || error });
  expect(handlers.onEnd).toHaveBeenCalledTimes(1);
});
it("reports a throwing start and closes exactly once", () => {
  vi.stubGlobal(
    "SpeechRecognition",
    class extends Recognition {
      override start = vi.fn(() => {
        throw Error("unavailable");
      });
    },
  );
  const handlers = { onFinal: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
  new WebSpeechInput().start({ language: "en" }, handlers);
  Recognition.instances[0]?.onend?.();
  expect(handlers.onError).toHaveBeenCalledWith(expect.objectContaining({ code: "unsupported" }));
  expect(handlers.onEnd).toHaveBeenCalledTimes(1);
});

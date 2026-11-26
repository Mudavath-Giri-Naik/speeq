import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AudioContextLike, createMicMonitor } from "../src/mic-monitor.js";

/** A fake microphone whose loudness the test controls. */
function rig(opts: { playing?: () => boolean } = {}) {
  const level = { value: 0.002 };
  const events: string[] = [];
  const stops: number[] = [];
  const context: AudioContextLike = {
    createMediaStreamSource: () => ({ connect() {} }),
    createAnalyser: () => ({
      fftSize: 0,
      getFloatTimeDomainData(array) {
        array.fill(level.value); // constant signal: RMS equals the value
      },
    }),
    close: () => {
      stops.push(1);
    },
  };
  const monitor = createMicMonitor({
    onVoice: () => events.push("voice"),
    onQuiet: () => events.push("quiet"),
    isPlaying: opts.playing,
    getUserMedia: async () => ({ getTracks: () => [{ stop: () => stops.push(2) }] }) as never,
    createContext: () => context,
  });
  return { monitor, level, events, stops };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it("hears a quiet voice that is only a little above a silent room", async () => {
  const { monitor, level, events } = rig();
  expect(await monitor.start()).toBe(true);
  await vi.advanceTimersByTimeAsync(400); // learn the silent background
  level.value = 0.02; // a quiet voice
  await vi.advanceTimersByTimeAsync(200);
  expect(events).toEqual(["voice"]);
  monitor.stop();
});

it("keeps reporting while the visitor talks, and says when they go quiet", async () => {
  const { monitor, level, events } = rig();
  await monitor.start();
  await vi.advanceTimersByTimeAsync(400);
  level.value = 0.05;
  await vi.advanceTimersByTimeAsync(1000);
  expect(events.filter((e) => e === "voice").length).toBeGreaterThanOrEqual(4);
  level.value = 0.002;
  await vi.advanceTimersByTimeAsync(900);
  expect(events.at(-1)).toBe("quiet");
  monitor.stop();
});

it("ignores a short click that is not a voice", async () => {
  const { monitor, level, events } = rig();
  await monitor.start();
  await vi.advanceTimersByTimeAsync(400);
  level.value = 0.3;
  await vi.advanceTimersByTimeAsync(40);
  level.value = 0.002;
  await vi.advanceTimersByTimeAsync(500);
  expect(events).toEqual([]);
  monitor.stop();
});

it("does not mistake the assistant's own steady voice for the visitor, but hears a louder one over it", async () => {
  let playing = false;
  const { monitor, level, events } = rig({ playing: () => playing });
  await monitor.start();
  await vi.advanceTimersByTimeAsync(400);
  playing = true;
  level.value = 0.04; // the assistant's voice leaking into the microphone
  await vi.advanceTimersByTimeAsync(1500);
  expect(events).toEqual([]);
  level.value = 0.16; // the visitor talks over it
  await vi.advanceTimersByTimeAsync(300);
  expect(events).toEqual(["voice"]);
  monitor.stop();
});

it("reports a level while on and zero after stop, and closes the microphone", async () => {
  const { monitor, level, stops } = rig();
  expect(monitor.level()).toBe(0);
  await monitor.start();
  level.value = 0.05;
  await vi.advanceTimersByTimeAsync(300);
  expect(monitor.level()).toBeGreaterThan(0.2);
  monitor.stop();
  monitor.stop();
  expect(monitor.level()).toBe(0);
  expect(stops).toContain(2);
});

it("returns false and never throws when the microphone is blocked", async () => {
  const blocked = createMicMonitor({
    onVoice() {},
    getUserMedia: async () => {
      throw new Error("denied");
    },
  });
  expect(await blocked.start()).toBe(false);
  const none = createMicMonitor({ onVoice() {}, getUserMedia: undefined });
  expect(await none.start()).toBe(false); // no mediaDevices in the test runtime
});

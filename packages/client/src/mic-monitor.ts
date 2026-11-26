import { VoiceDetector } from "./voice-detector.js";
/**
 * Listens to the microphone level, apart from speech recognition. It notices that the visitor is
 * talking within about 100 ms, even when the voice is quiet, so the assistant can stop talking at
 * once. Speech recognition alone is slow to react and can mistake the assistant's own voice for
 * the visitor's.
 *
 * It asks the browser for echo cancellation, noise suppression and automatic gain, so quiet
 * voices are boosted and the assistant's own voice is reduced where the browser can do that.
 */

/** What a mic monitor reports. */
export interface MicMonitorHandlers {
  /** The visitor started talking, and again every ~200 ms while they keep talking. */
  onVoice(): void;
  /** The visitor went quiet. */
  onQuiet?(): void;
}

/** A microphone level listener. */
export interface MicMonitor {
  /** Opens the microphone. Resolves `false` when it is not available. Never throws. */
  start(): Promise<boolean>;
  /** Closes the microphone. Safe to call twice. */
  stop(): void;
  /** Current loudness from 0 to 1, smoothed. 0 when the monitor is off. */
  level(): number;
}

/** Settings for {@link createMicMonitor}. Every value has a good default. */
export interface MicMonitorOptions extends MicMonitorHandlers {
  /** True while the assistant is talking. The monitor then expects its own voice in the signal. */
  isPlaying?: () => boolean;
  /** Loudness (0 to 1 RMS) below which nothing counts as a voice. Default 0.012. */
  minLevel?: number;
  /** How much louder than the background a voice must be. Default 2.4. */
  ratio?: number;
  /** How long the loudness must stay up before it counts as a voice, in ms. Default 90. */
  holdMs?: number;
  /** How long it must stay down before the visitor counts as quiet, in ms. Default 650. */
  quietMs?: number;
  /** Test hooks. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createContext?: () => AudioContextLike;
  now?: () => number;
}

/** The small part of the Web Audio API this module uses. */
export interface AudioContextLike {
  createMediaStreamSource(stream: MediaStream): { connect(node: unknown): void };
  createAnalyser(): {
    fftSize: number;
    getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void;
  };
  close(): Promise<void> | void;
  resume?(): Promise<void> | void;
}

const TICK_MS = 40;
export function createMicMonitor(options: MicMonitorOptions): MicMonitor {
  const detector = new VoiceDetector(options);
  const now = options.now ?? (() => Date.now());

  let stream: MediaStream | undefined;
  let context: AudioContextLike | undefined;
  let analyser: ReturnType<AudioContextLike["createAnalyser"]> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let buffer: Float32Array<ArrayBuffer> | undefined;
  let starting: Promise<boolean> | undefined;
  let stopped = false;

  function tick() {
    if (!analyser || !buffer) return;
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += (buffer[i] ?? 0) * (buffer[i] ?? 0);
    const rms = Math.sqrt(sum / buffer.length);
    const event = detector.push(rms, now(), options.isPlaying?.() === true);
    if (event === "voice") options.onVoice();
    else if (event === "quiet") options.onQuiet?.();
  }
  async function open(): Promise<boolean> {
    try {
      const getUserMedia =
        options.getUserMedia ??
        (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia
          ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
          : undefined);
      if (!getUserMedia) return false;
      const media = await getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (stopped) {
        for (const track of media.getTracks()) track.stop();
        return false;
      }
      const make =
        options.createContext ??
        (() => {
          const Ctor =
            typeof globalThis.AudioContext === "function"
              ? globalThis.AudioContext
              : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctor) throw new Error("no AudioContext");
          return new Ctor() as unknown as AudioContextLike;
        });
      context = make();
      await context.resume?.();
      const source = context.createMediaStreamSource(media);
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      source.connect(analyser);
      stream = media;
      timer = setInterval(tick, TICK_MS);
      return true;
    } catch {
      return false;
    }
  }

  return {
    start() {
      stopped = false;
      starting ??= open();
      return starting;
    },
    stop() {
      stopped = true;
      starting = undefined;
      if (timer) clearInterval(timer);
      timer = undefined;
      for (const track of stream?.getTracks() ?? []) track.stop();
      stream = undefined;
      void Promise.resolve(context?.close()).catch(() => {});
      context = undefined;
      analyser = undefined;
      detector.reset();
    },
    level() {
      return analyser ? detector.level : 0;
    },
  };
}

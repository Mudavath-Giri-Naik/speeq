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
/** While the assistant talks, the first moments are used to learn how loud its own voice is. */
const CALIBRATE_MS = 350;
const HEARTBEAT_MS = 200;

export function createMicMonitor(options: MicMonitorOptions): MicMonitor {
  const minLevel = options.minLevel ?? 0.012;
  const ratio = options.ratio ?? 2.4;
  const holdMs = options.holdMs ?? 90;
  const quietMs = options.quietMs ?? 650;
  const now = options.now ?? (() => Date.now());

  let stream: MediaStream | undefined;
  let context: AudioContextLike | undefined;
  let analyser: ReturnType<AudioContextLike["createAnalyser"]> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let buffer: Float32Array<ArrayBuffer> | undefined;
  let starting: Promise<boolean> | undefined;
  let stopped = false;

  let smooth = 0;
  /** Background loudness while nobody talks. */
  let floor = 0.004;
  /** How loud the assistant's own voice is in the signal, learned while it talks. */
  let echo = 0;
  let wasPlaying = false;
  let playingSince = 0;
  let loudSince = 0;
  let quietSince = 0;
  let talking = false;
  let lastBeat = 0;

  function tick() {
    if (!analyser || !buffer) return;
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += (buffer[i] ?? 0) * (buffer[i] ?? 0);
    const rms = Math.sqrt(sum / buffer.length);
    const t = now();
    smooth = smooth * 0.6 + rms * 0.4;

    const playing = options.isPlaying?.() === true;
    if (playing && !wasPlaying) {
      playingSince = t;
      echo = 0;
    }
    wasPlaying = playing;

    if (playing && t - playingSince < CALIBRATE_MS) {
      // Learn how loud the assistant's own voice is, and do not react to it.
      echo = Math.max(echo, rms);
      return;
    }

    const background = playing ? Math.max(floor, echo) : floor;
    const threshold = Math.max(minLevel, background * ratio);
    const loud = rms > threshold;

    if (!loud && !talking)
      floor = rms < floor ? rms * 0.6 + floor * 0.4 : floor * 0.98 + rms * 0.02;

    if (loud) {
      quietSince = 0;
      if (!loudSince) loudSince = t;
      if (t - loudSince >= holdMs) {
        if (!talking) {
          talking = true;
          lastBeat = t;
          options.onVoice();
        } else if (t - lastBeat >= HEARTBEAT_MS) {
          lastBeat = t;
          options.onVoice();
        }
      }
    } else {
      loudSince = 0;
      if (talking) {
        if (!quietSince) quietSince = t;
        else if (t - quietSince >= quietMs) {
          talking = false;
          quietSince = 0;
          options.onQuiet?.();
        }
      }
    }
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
      smooth = 0;
      talking = false;
      loudSince = 0;
      quietSince = 0;
    },
    level() {
      return analyser ? Math.min(1, smooth * 9) : 0;
    },
  };
}

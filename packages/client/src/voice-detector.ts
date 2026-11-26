import type { MicMonitorOptions } from "./mic-monitor.js";

/** While the assistant talks, the first moments are used to learn how loud its own voice is. */
const CALIBRATE_MS = 350;
const HEARTBEAT_MS = 200;

/** Adaptive level detector shared by microphone monitors. */
export class VoiceDetector {
  private smooth = 0;
  /** Background loudness while nobody talks. */
  private floor = 0.004;
  /** How loud the assistant's own voice is in the signal, learned while it talks. */
  private echo = 0;
  private wasPlaying = false;
  private playingSince = 0;
  private loudSince = 0;
  private quietSince = 0;
  private talking = false;
  private lastBeat = 0;

  constructor(
    private options: Pick<MicMonitorOptions, "minLevel" | "ratio" | "quietMs" | "holdMs"> = {},
  ) {}
  get level() {
    return Math.min(1, this.smooth * 9);
  }
  reset() {
    this.smooth = 0;
    this.talking = false;
    this.loudSince = 0;
    this.quietSince = 0;
  }
  push(rms: number, t: number, playing: boolean): "voice" | "quiet" | null {
    this.smooth = this.smooth * 0.6 + rms * 0.4;

    if (playing && !this.wasPlaying) {
      this.playingSince = t;
      this.echo = 0;
    }
    this.wasPlaying = playing;

    if (playing && t - this.playingSince < CALIBRATE_MS) {
      // Learn how loud the assistant's own voice is, and do not react to it.
      this.echo = Math.max(this.echo, rms);
      return null;
    }

    const background = playing ? Math.max(this.floor, this.echo) : this.floor;
    const threshold = Math.max(
      this.options.minLevel ?? 0.012,
      background * (this.options.ratio ?? 2.4),
    );
    const loud = rms > threshold;

    if (!loud && !this.talking)
      this.floor = rms < this.floor ? rms * 0.6 + this.floor * 0.4 : this.floor * 0.98 + rms * 0.02;

    if (loud) {
      this.quietSince = 0;
      if (!this.loudSince) this.loudSince = t;
      if (t - this.loudSince >= (this.options.holdMs ?? 90)) {
        if (!this.talking) {
          this.talking = true;
          this.lastBeat = t;
          return "voice";
        } else if (t - this.lastBeat >= HEARTBEAT_MS) {
          this.lastBeat = t;
          return "voice";
        }
      }
    } else {
      this.loudSince = 0;
      if (this.talking) {
        if (!this.quietSince) this.quietSince = t;
        else if (t - this.quietSince >= (this.options.quietMs ?? 650)) {
          this.talking = false;
          this.quietSince = 0;
          return "quiet";
        }
      }
    }
    return null;
  }
}

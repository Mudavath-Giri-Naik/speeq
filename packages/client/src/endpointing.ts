/** Detect utterance boundaries from timestamped RMS frames. */
export class Endpointing {
  private loud?: number;
  private start?: number;
  private quiet?: number;
  constructor(
    private readonly options: {
      endpointMs?: number;
      minUtteranceMs?: number;
      maxUtteranceMs?: number;
      voiceHoldMs?: number;
    } = {},
  ) {}
  push({ rms, now }: { rms: number; now: number }): "speechStart" | "speechEnd" | null {
    const voiced = rms > 0.012;
    if (this.start === undefined) {
      if (!voiced) {
        this.loud = undefined;
        return null;
      }
      this.loud ??= now;
      if (now - this.loud < (this.options.voiceHoldMs ?? 90)) return null;
      this.start = this.loud;
      return "speechStart";
    }
    if (voiced) this.quiet = undefined;
    else this.quiet ??= now;
    const duration = now - this.start;
    if (
      duration >= (this.options.maxUtteranceMs ?? 30000) ||
      (this.quiet !== undefined &&
        now - this.quiet >= (this.options.endpointMs ?? 700) &&
        duration >= (this.options.minUtteranceMs ?? 250))
    ) {
      this.start = this.quiet = this.loud = undefined;
      return "speechEnd";
    }
    return null;
  }
}

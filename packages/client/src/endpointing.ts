/** Detect utterance boundaries from timestamped RMS frames. */
export class Endpointing {
  private loud?: number;
  private start?: number;
  private quiet?: number;
  private lastVoiced = 0;
  constructor(
    private readonly options: {
      endpointMs?: number;
      /** How long the visitor must actually speak for it to count. Shorter sounds are dropped. */
      minUtteranceMs?: number;
      maxUtteranceMs?: number;
      voiceHoldMs?: number;
    } = {},
  ) {}
  push({
    rms,
    now,
  }: {
    rms: number;
    now: number;
  }): "speechStart" | "speechEnd" | "speechCancel" | null {
    const voiced = rms > 0.012;
    if (this.start === undefined) {
      if (!voiced) {
        this.loud = undefined;
        return null;
      }
      this.loud ??= now;
      if (now - this.loud < (this.options.voiceHoldMs ?? 90)) return null;
      this.start = this.loud;
      this.lastVoiced = now;
      return "speechStart";
    }
    if (voiced) {
      this.quiet = undefined;
      this.lastVoiced = now;
    } else this.quiet ??= now;
    const duration = now - this.start;
    if (duration >= (this.options.maxUtteranceMs ?? 25000)) {
      this.start = this.quiet = this.loud = undefined;
      return "speechEnd";
    }
    if (this.quiet !== undefined && now - this.quiet >= (this.options.endpointMs ?? 700)) {
      // Measure the time actually spoken, not the silence after it: a click or a cough is not
      // an utterance, however long the pause that follows it.
      const spoken = this.lastVoiced - this.start;
      this.start = this.quiet = this.loud = undefined;
      return spoken >= (this.options.minUtteranceMs ?? 250) ? "speechEnd" : "speechCancel";
    }
    return null;
  }
}

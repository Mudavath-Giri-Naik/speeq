import type { SpeechOutput } from "@speeq/core";

/** Serializes utterances and invalidates queued work immediately on barge-in. */
export class SpeechQueue {
  private generation = 0;
  private tail = Promise.resolve();
  private voices = new Map<string, Promise<boolean>>();
  pending = 0;

  constructor(
    private output: SpeechOutput | null | undefined,
    private enabled: boolean,
  ) {}

  voice(language: string) {
    let result = this.voices.get(language);
    if (!result) {
      result = Promise.resolve()
        .then(() => this.output?.hasVoiceFor(language) ?? false)
        .catch(() => false);
      this.voices.set(language, result);
    }
    return result;
  }

  enqueue(text: string, language: string, started: () => void) {
    if (!text || !this.enabled || !this.output?.supported) return Promise.resolve();
    const generation = this.generation;
    const output = this.output;
    this.pending++;
    this.tail = this.tail
      .then(async () => {
        if (
          generation !== this.generation ||
          !(await this.voice(language)) ||
          generation !== this.generation
        )
          return;
        started();
        if (generation === this.generation) await output.speak(text, { language });
      })
      .catch((error) => console.error("[speeq] speech output failed", error))
      .finally(() => {
        if (generation === this.generation) this.pending--;
      });
    return this.tail;
  }

  drain() {
    return this.tail;
  }

  cancel() {
    this.generation++;
    this.pending = 0;
    this.tail = Promise.resolve();
    this.output?.cancel();
  }
}

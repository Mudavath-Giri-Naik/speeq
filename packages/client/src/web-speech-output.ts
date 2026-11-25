import type { SpeechOutput } from "@speeq/core";
import {
  type SpeechSynthesisVoiceLike,
  type SynthesisLike,
  synthesisApi,
  type UtteranceLike,
} from "./web-speech-types.js";

/** Controls browser voice selection and playback. */
export interface WebSpeechOutputOptions {
  /** Default 1. */
  rate?: number;
  /** Default 1. */
  pitch?: number;
  /** Override voice choice. Return undefined to fall back to the built-in matching. */
  selectVoice?: (
    language: string,
    voices: readonly SpeechSynthesisVoiceLike[],
  ) => SpeechSynthesisVoiceLike | undefined;
  /** Max wait for voiceschanged when the voice list is empty. Default 1500 ms. */
  voicesTimeoutMs?: number;
}

function normalize(language: string) {
  return language.replaceAll("_", "-").toLowerCase();
}

function matchVoice(language: string, voices: readonly SpeechSynthesisVoiceLike[]) {
  const tag = normalize(language);
  const exact = voices.filter((v) => normalize(v.lang) === tag);
  const preferred = exact.filter((v) => v.default);
  const candidates = preferred.length ? preferred : exact;
  return (
    candidates.find((v) => v.localService) ??
    candidates[0] ??
    voices.find((v) => normalize(v.lang).split("-")[0] === tag.split("-")[0])
  );
}

/** Speaks utterances using the device's speech synthesis service. */
export class WebSpeechOutput implements SpeechOutput {
  private waiting?: Promise<void>;
  private pending = new Set<() => void>();

  constructor(private readonly options: WebSpeechOutputOptions = {}) {}
  get supported(): boolean {
    return !!synthesisApi();
  }

  private async voice(language: string, synth: SynthesisLike) {
    let voices = synth.getVoices();
    if (!voices.length) {
      this.waiting ??= new Promise<void>((resolve) => {
        const ready = () => {
          clearTimeout(timer);
          synth.removeEventListener("voiceschanged", ready);
          resolve();
        };
        const timer = setTimeout(ready, Math.min(1500, this.options.voicesTimeoutMs ?? 1500));
        synth.addEventListener("voiceschanged", ready);
      }).finally(() => {
        this.waiting = undefined;
      });
      await this.waiting;
      voices = synth.getVoices();
    }
    return this.options.selectVoice?.(language, voices) ?? matchVoice(language, voices);
  }

  async hasVoiceFor(language: string): Promise<boolean> {
    const api = synthesisApi();
    return !!api && !!(await this.voice(language, api.synth));
  }

  async speak(
    text: string,
    { language, signal }: Parameters<SpeechOutput["speak"]>[1],
  ): Promise<void> {
    if (signal?.aborted) return;
    const api = synthesisApi();
    if (!api) return;
    await new Promise<void>((resolve) => {
      let utterance: UtteranceLike | undefined;
      const abort = () => this.cancel();
      const finish = () => {
        this.pending.delete(finish);
        signal?.removeEventListener("abort", abort);
        if (utterance) utterance.onend = utterance.onerror = null;
        resolve();
      };
      this.pending.add(finish);
      signal?.addEventListener("abort", abort);
      void this.voice(language, api.synth)
        .then((voice) => {
          if (!this.pending.has(finish)) return;
          utterance = new api.Utterance(text);
          utterance.lang = language;
          if (voice) utterance.voice = voice;
          utterance.rate = this.options.rate ?? 1;
          utterance.pitch = this.options.pitch ?? 1;
          utterance.onend = utterance.onerror = finish;
          if (api.synth.paused) api.synth.resume();
          api.synth.speak(utterance);
        })
        .catch(finish);
    });
  }

  /** Pauses the current utterance. `resume()` continues from the same spot. */
  pause(): void {
    synthesisApi()?.synth.pause?.();
  }

  resume(): void {
    synthesisApi()?.synth.resume();
  }

  cancel(): void {
    try {
      synthesisApi()?.synth.cancel();
    } finally {
      for (const finish of this.pending) finish();
    }
  }
}

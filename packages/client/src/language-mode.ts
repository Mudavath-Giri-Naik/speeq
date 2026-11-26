import { baseLanguage, guessLanguageFromScript } from "@speeq/core/utils";
/** Tracks input language independently from the reply and requires repeated weak evidence. */
export class LanguageMode {
  input: string | null = null;
  private pending?: string;
  constructor(public auto = false) {}
  set(tag: string) {
    this.auto = tag === "auto";
    this.input = this.auto ? null : tag;
    this.pending = undefined;
  }
  observe(
    text: string,
    candidates: readonly string[],
    preferred: string,
    provider?: string,
    confidence?: number,
  ) {
    if (!this.auto) return this.input ?? preferred;
    const matching =
      provider &&
      (candidates.find((c) => c.toLowerCase() === provider.toLowerCase()) ??
        candidates.find((c) => baseLanguage(c) === baseLanguage(provider)));
    const guess = matching
      ? { language: matching, confidence: confidence ?? 1 }
      : guessLanguageFromScript(text, candidates);
    const next =
      guess.language ??
      candidates.find((c) => baseLanguage(c) === baseLanguage(preferred)) ??
      candidates[0] ??
      preferred;
    if (guess.confidence >= 0.6 || this.pending === next) {
      this.input = next;
      this.pending = undefined;
    } else this.pending = next;
    return this.input ?? preferred;
  }
}

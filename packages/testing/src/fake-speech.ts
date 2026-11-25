import type {
  SpeakOptions,
  SpeechInput,
  SpeechInputHandlers,
  SpeechInputOptions,
  SpeechOutput,
} from "@speeq/core";

/**
 * A scriptable {@link SpeechInput}. Call {@link FakeSpeechInput.say} to simulate the user speaking
 * while recognition is active.
 */
export class FakeSpeechInput implements SpeechInput {
  readonly supported: boolean;
  /** Options of every `start()` call. */
  readonly starts: SpeechInputOptions[] = [];
  private handlers: SpeechInputHandlers | null = null;
  private pendingFinal = "";

  constructor(options: { supported?: boolean } = {}) {
    this.supported = options.supported ?? true;
  }

  /** True while recognition is active. */
  get listening(): boolean {
    return this.handlers !== null;
  }

  start(options: SpeechInputOptions, handlers: SpeechInputHandlers): void {
    this.starts.push(options);
    this.handlers = handlers;
  }

  /** Simulates speech: emits interim transcripts, then the final one, then ends. */
  say(final: string, interim: string[] = []): void {
    const h = this.handlers;
    if (!h) throw new Error("FakeSpeechInput.say() called while not listening");
    for (const partial of interim) h.onInterim?.(partial);
    h.onFinal(final);
    this.end();
  }

  /** Simulates the browser detecting speech before any words exist. */
  speechStart(): void {
    this.handlers?.onSpeechStart?.();
  }

  /** Emits an interim transcript and keeps listening (for calls). */
  interim(text: string): void {
    this.handlers?.onInterim?.(text);
  }

  /** Emits a finished phrase and keeps listening (for calls). */
  final(text: string): void {
    this.handlers?.onFinal(text);
  }

  /** Ends recognition, as a browser does after silence. */
  finish(): void {
    this.end();
  }

  /** Simulates an interim transcript only (user still speaking). */
  partial(text: string): void {
    this.pendingFinal = text;
    this.handlers?.onInterim?.(text);
  }

  /** Simulates a recognition error. */
  fail(code: Parameters<NonNullable<SpeechInputHandlers["onError"]>>[0]["code"]): void {
    this.handlers?.onError?.({ code, message: code });
    this.end();
  }

  stop(): void {
    const h = this.handlers;
    if (h && this.pendingFinal) h.onFinal(this.pendingFinal);
    this.end();
  }

  abort(): void {
    this.pendingFinal = "";
    this.end();
  }

  private end(): void {
    const h = this.handlers;
    this.handlers = null;
    this.pendingFinal = "";
    h?.onEnd?.();
  }
}

/** A {@link SpeechOutput} that records what would be spoken. */
export class FakeSpeechOutput implements SpeechOutput {
  readonly supported: boolean;
  /** Every text passed to `speak()`, in order, with its language. */
  readonly spoken: Array<{ text: string; language: string }> = [];
  /** Number of `cancel()` calls. */
  cancelCount = 0;
  /** Number of `pause()` and `resume()` calls. */
  pauseCount = 0;
  resumeCount = 0;
  /** True between `pause()` and `resume()` or `cancel()`. */
  paused = false;
  private readonly voices: Set<string> | null;
  private readonly speakMs: number;

  /**
   * @param options.voices - Languages that have a voice. Omit to have voices for every language.
   * @param options.speakMs - How long each `speak()` takes. Default 0.
   */
  constructor(options: { supported?: boolean; voices?: string[]; speakMs?: number } = {}) {
    this.supported = options.supported ?? true;
    this.voices = options.voices ? new Set(options.voices) : null;
    this.speakMs = options.speakMs ?? 0;
  }

  async hasVoiceFor(language: string): Promise<boolean> {
    return this.supported && (this.voices === null || this.voices.has(language));
  }

  async speak(text: string, options: SpeakOptions): Promise<void> {
    this.spoken.push({ text, language: options.language });
    if (this.speakMs > 0) await new Promise((r) => setTimeout(r, this.speakMs));
  }

  cancel(): void {
    this.cancelCount += 1;
    this.paused = false;
  }

  pause(): void {
    this.pauseCount += 1;
    this.paused = true;
  }

  resume(): void {
    this.resumeCount += 1;
    this.paused = false;
  }
}

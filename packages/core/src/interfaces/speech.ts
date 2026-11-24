/** Callbacks for a {@link SpeechInput} recognition session. */
export interface SpeechInputHandlers {
  /** Partial transcript while the user is speaking. */
  onInterim?(transcript: string): void;
  /** Final transcript of one utterance. */
  onFinal(transcript: string): void;
  /** Recognition failed (no permission, no speech, network). */
  onError?(error: {
    code: "not-allowed" | "no-speech" | "network" | "aborted" | "unsupported" | "other";
    message: string;
  }): void;
  /** Recognition stopped (always called last). */
  onEnd?(): void;
}

/** Options for {@link SpeechInput.start}. */
export interface SpeechInputOptions {
  /** BCP 47 tag, e.g. `te-IN`. */
  language: string;
  /** Emit interim transcripts. Default `true`. */
  interimResults?: boolean;
}

/** Speech-to-text. The default implementation uses the browser Web Speech API. */
export interface SpeechInput {
  /** Whether speech recognition can work in this environment. */
  readonly supported: boolean;
  start(options: SpeechInputOptions, handlers: SpeechInputHandlers): void;
  /** Stop listening and deliver the final transcript. */
  stop(): void;
  /** Stop listening and discard the transcript. */
  abort(): void;
}

/** Options for {@link SpeechOutput.speak}. */
export interface SpeakOptions {
  language: string;
  signal?: AbortSignal;
}

/** Text-to-speech. The default implementation uses the browser `speechSynthesis` API. */
export interface SpeechOutput {
  /** Whether speech synthesis exists in this environment. */
  readonly supported: boolean;
  /** Whether a voice exists for `language` on this device. */
  hasVoiceFor(language: string): Promise<boolean>;
  /** Speaks `text`. Resolves when finished or cancelled. Calls queue in order. */
  speak(text: string, options: SpeakOptions): Promise<void>;
  /** Stops speaking and clears the queue. */
  cancel(): void;
}

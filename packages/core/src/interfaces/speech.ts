import type { StreamingMode, VoiceInfo } from "./speech-provider.js";

/** Recognition features exposed by a client input. */
export interface SpeechInputCapabilities {
  streaming: StreamingMode;
  detectsLanguage: boolean;
  processing: "local" | "remote";
  providerId?: string;
}

/** Callbacks for a {@link SpeechInput} recognition session. */
export interface SpeechInputHandlers {
  /** Partial transcript while the user is speaking. */
  onInterim?(transcript: string): void;
  /**
   * Final transcript. In single-utterance mode this is called once when recognition ends. In
   * {@link SpeechInputOptions.continuous} mode it is called for every finished phrase while
   * recognition keeps running.
   */
  onFinal(transcript: string): void;
  /** Sound that looks like speech was detected (before any transcript exists). Optional. */
  onSpeechStart?(): void;
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
  /**
   * Keep listening after a pause and deliver each finished phrase through `onFinal`. Used for
   * hands-free calls. Default `false` (one utterance, then recognition ends).
   */
  continuous?: boolean;
}

/** Speech-to-text. The default implementation uses the browser Web Speech API. */
export interface SpeechInput {
  readonly capabilities?: SpeechInputCapabilities;
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
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  style?: string;
  language: string;
  signal?: AbortSignal;
}

/** Text-to-speech. The default implementation uses the browser `speechSynthesis` API. */
export interface SpeechOutput {
  prepare?(text: string, options: SpeakOptions): void;
  listVoices?(language?: string): Promise<readonly VoiceInfo[]>;
  /** Whether speech synthesis exists in this environment. */
  readonly supported: boolean;
  /** Whether a voice exists for `language` on this device. */
  hasVoiceFor(language: string): Promise<boolean>;
  /** Speaks `text`. Resolves when finished or cancelled. Calls queue in order. */
  speak(text: string, options: SpeakOptions): Promise<void>;
  /** Stops speaking and clears the queue. */
  cancel(): void;
  /** Pauses the current utterance so that `resume()` can continue from the same spot. Optional. */
  pause?(): void;
  /** Continues after `pause()`. Optional. */
  resume?(): void;
}

/** Deployment and billing category. */
export type ProviderKind = "self-hosted" | "remote-free-tier" | "remote-paid";
/** How recognition delivers transcripts. */
export type StreamingMode = "native" | "simulated" | "buffered";
/** Requested speech encoding. */
export type AudioFormat = "mp3" | "wav" | "opus" | "pcm16";

/** Recognition context supplied by the application. */
export interface SttHints {
  vocabulary?: readonly string[];
  prompt?: string;
}
/** One buffered speech recognition request. */
export interface SttRequest {
  audio: Uint8Array;
  /** MIME type of `audio`, for example `audio/wav`. */
  mimeType: string;
  /** BCP 47. Omit to let the provider detect the language. */
  language?: string;
  hints?: SttHints;
  signal?: AbortSignal;
}
/** Transcript and measurements reported by a recognizer. */
export interface SttResult {
  text: string;
  /** BCP 47 base tag as reported by the provider, if it reports one. */
  language?: string;
  languageConfidence?: number; // 0..1
  confidence?: number; // 0..1, only when the provider reports it
  audioMs?: number;
  /** Time spent in the provider call, measured by speeq. */
  providerMs: number;
}
/** Recognition features supported by a provider. */
export interface SttCapabilities {
  streaming: StreamingMode;
  detectsLanguage: boolean;
  vocabulary: "native" | "prompt" | "none";
  languages: readonly string[] | "any";
  maxAudioSeconds: number;
}
/** Server-side speech recognizer. */
export interface SttProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly capabilities: SttCapabilities;
  transcribe(request: SttRequest): Promise<SttResult>;
}

/** Discoverable voice and supported controls. */
export interface VoiceInfo {
  id: string;
  name: string;
  languages: readonly string[];
  locale?: string;
  gender?: "female" | "male" | "neutral";
  accent?: string;
  styles?: readonly string[];
  provider: string;
  processing: "local" | "remote";
  streaming: boolean;
  supports: { rate: boolean; pitch: boolean; volume: boolean; style: boolean };
}
/** A configurable synthesis parameter. */
export type VoiceParam = "rate" | "pitch" | "volume" | "style";
/** One sentence to synthesize. */
export interface TtsRequest {
  text: string;
  language: string;
  voiceId?: string;
  rate?: number; // 1 = normal
  pitch?: number; // 1 = normal
  volume?: number; // 0..1
  style?: string;
  format?: AudioFormat;
  signal?: AbortSignal;
}
/** Audio and unapplied synthesis controls. */
export interface TtsResult {
  audio: ReadableStream<Uint8Array>;
  mimeType: string;
  /** Parameters the provider could not apply. */
  ignored: readonly VoiceParam[];
}
/** Formats and languages accepted by a synthesizer. */
export interface TtsCapabilities {
  streamingAudio: boolean;
  formats: readonly AudioFormat[];
  languages: readonly string[] | "any";
}
/** Server-side speech synthesizer. */
export interface TtsProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly capabilities: TtsCapabilities;
  listVoices(): Promise<readonly VoiceInfo[]>;
  synthesize(request: TtsRequest): Promise<TtsResult>;
}

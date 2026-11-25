import type { ClientConfig, ProtocolEvent, SpeechInput, SpeechOutput } from "@speeq/core";
import type { PublicError } from "@speeq/core/errors";

/** Current activity of the client. */
export type SpeeqState = "idle" | "listening" | "thinking" | "speaking" | "error";

/** One user or assistant message in the local conversation. */
export interface ChatMessage {
  id: string; // createId("msg") for local ids
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "done" | "interrupted" | "error";
  turnId?: string;
}

/** A write action awaiting approval. */
export interface PendingConfirmation {
  confirmationId: string;
  toolName: string;
  summary: string;
  args: unknown;
}

/** A navigation request from the assistant. */
export interface NavigateAction {
  routeId: string;
  href: string;
  params: Record<string, unknown>;
}

/** Context supplied by the host page. */
export interface PageContextInput {
  path?: string;
  title?: string;
  data?: Record<string, unknown>;
}

/** State of a hands-free call. */
export interface CallState {
  /** True from `startCall()` until `endCall()`. */
  active: boolean;
  /** True while spoken output is paused because the visitor started talking over it. */
  interrupted: boolean;
}

/** Tuning for hands-free calls. All fields are optional. */
export interface CallOptions {
  /**
   * How long to keep spoken output paused after the visitor starts talking over it. If no real
   * words follow, speech resumes from where it stopped. Default 1000 ms.
   */
  interruptGraceMs?: number;
  /**
   * Ignore the assistant's own voice when the microphone picks it up from the speakers, so it
   * does not interrupt itself. Default true.
   */
  echoGuard?: boolean;
  /**
   * Send what the visitor said after this many milliseconds without new words, instead of waiting
   * for the browser to finish the phrase. Lower is faster but may cut people off. Default 0 (off).
   */
  commitAfterMs?: number;
}

/** Current view of the conversation and device capabilities. */
export interface SpeeqSnapshot {
  state: SpeeqState;
  language: string;
  languages: string[];
  messages: ChatMessage[];
  interimTranscript: string;
  pendingConfirmation: PendingConfirmation | null;
  error: PublicError | null;
  activeTools: Array<{ callId: string; name: string }>;
  /** Hands-free call status. */
  call: CallState;
  support: { speechInput: boolean; speechOutput: boolean; voiceForLanguage: boolean | null };
  config: ClientConfig | null;
  sessionId: string | null;
}

/** Configures transport, speech and host callbacks. */
export interface SpeeqClientOptions {
  /** Base URL of the mounted handler, e.g. "/api/speeq". */
  endpoint: string;
  languages?: string[];
  language?: string;
  onNavigate?: (action: NavigateAction) => void;
  getContext?: () => PageContextInput | undefined;
  /** Omitted or undefined input/output use Web Speech defaults. Pass null to disable either adapter. */
  speech?: { input?: SpeechInput | null; output?: SpeechOutput | null };
  /** Speak assistant replies when possible. Default true. */
  speakReplies?: boolean;
  /** Send the final voice transcript automatically. Default true. */
  autoSendOnFinal?: boolean;
  /** Default "memory". */
  persistSession?: "memory" | "sessionStorage";
  /** Tuning for `startCall()`. */
  call?: CallOptions;
  fetch?: typeof fetch;
}

/** Payloads delivered by client event listeners. */
export interface SpeeqClientEvents {
  change: SpeeqSnapshot;
  state: SpeeqState; // emitted only when state actually changes
  event: ProtocolEvent; // every valid protocol event received
  navigate: NavigateAction;
  error: PublicError; // every time snapshot.error becomes non-null
}

/** Controls a headless conversation and exposes its current snapshot. */
export interface SpeeqClient {
  getSnapshot(): SpeeqSnapshot;
  subscribe(listener: () => void): () => void;
  on<K extends keyof SpeeqClientEvents>(
    event: K,
    cb: (payload: SpeeqClientEvents[K]) => void,
  ): () => void;
  sendText(text: string, options?: { inputMode?: "text" | "voice" }): Promise<void>;
  startListening(): void;
  stopListening(): void;
  /**
   * Starts a hands-free call: the microphone stays on, each finished phrase is sent as a turn,
   * replies are spoken, and the visitor can talk over the assistant at any time. Must be called
   * from a user gesture so the browser allows the microphone.
   */
  startCall(): void;
  /** Ends the call, stops listening and stops speaking. */
  endCall(): void;
  cancel(): void;
  setLanguage(language: string): void;
  confirm(confirmationId: string, approved: boolean): Promise<void>;
  speak(text: string): Promise<void>;
  destroy(): void;
}

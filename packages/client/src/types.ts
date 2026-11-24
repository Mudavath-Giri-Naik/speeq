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
  cancel(): void;
  setLanguage(language: string): void;
  confirm(confirmationId: string, approved: boolean): Promise<void>;
  speak(text: string): Promise<void>;
  destroy(): void;
}

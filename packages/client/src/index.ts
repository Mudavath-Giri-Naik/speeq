export { isSpeeqError, SpeeqError } from "@speeq/core/errors";
export type {
  AuditClient,
  AuditClientOptions,
  AuditListParams,
  ConversationEvent,
  SessionDetailResponse,
  SessionFilter,
  SessionListResponse,
  SessionSummary,
} from "./audit.js";
export { createAuditClient } from "./audit.js";
export { createSpeeqClient } from "./client.js";
export type {
  AudioContextLike,
  MicMonitor,
  MicMonitorHandlers,
  MicMonitorOptions,
} from "./mic-monitor.js";
export { createMicMonitor } from "./mic-monitor.js";
export type {
  CallOptions,
  CallState,
  ChatMessage,
  NavigateAction,
  PageContextInput,
  PendingConfirmation,
  SpeeqClient,
  SpeeqClientEvents,
  SpeeqClientOptions,
  SpeeqSnapshot,
  SpeeqState,
} from "./types.js";
export { WebSpeechInput } from "./web-speech-input.js";
export { WebSpeechOutput, type WebSpeechOutputOptions } from "./web-speech-output.js";
export { detectSpeechSupport } from "./web-speech-types.js";

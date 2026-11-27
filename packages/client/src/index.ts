export { isSpeeqError, SpeeqError } from "@speeq/core/errors";
export { formFillActionName } from "@speeq/core/utils";
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
export { createFormFillHandler, type FormBinding } from "./form-fill.js";
export type {
  AudioContextLike,
  MicMonitor,
  MicMonitorHandlers,
  MicMonitorOptions,
} from "./mic-monitor.js";
export { createMicMonitor } from "./mic-monitor.js";
export { ServerSpeechInput } from "./server-speech-input.js";
export { ServerSpeechOutput } from "./server-speech-output.js";
export type {
  CallOptions,
  CallState,
  ChatMessage,
  ClientVoice,
  NavigateAction,
  PageContextInput,
  PendingConfirmation,
  PendingUiAction,
  SpeeqClient,
  SpeeqClientEvents,
  SpeeqClientOptions,
  SpeeqSnapshot,
  SpeeqState,
  UiActionHandler,
} from "./types.js";
export { WebSpeechInput } from "./web-speech-input.js";
export { WebSpeechOutput, type WebSpeechOutputOptions } from "./web-speech-output.js";
export { detectSpeechSupport } from "./web-speech-types.js";

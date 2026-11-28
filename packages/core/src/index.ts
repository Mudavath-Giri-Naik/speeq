/**
 * `@speeq/core`: the shared contract of speeq. It holds the Zod schemas for the HTTP + SSE
 * protocol, the audit log and telemetry, the adapter interfaces, `SpeeqError`, and small utilities.
 * @packageDocumentation
 */

export {
  DEFAULT_LANGUAGES,
  LANGUAGE_LABELS,
  LATENCY_BUCKETS_MS,
  PROTOCOL_VERSION,
  TELEMETRY_SCHEMA_VERSION,
} from "./constants.js";
export * from "./errors.js";
export type { AgentContext, AgentUser, AgentUserProfile } from "./interfaces/context.js";
export type { KnowledgeResult, KnowledgeSource } from "./interfaces/knowledge.js";
export type {
  JsonSchema,
  LLMFinishReason,
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMStreamChunk,
  LLMToolCall,
  LLMToolDefinition,
} from "./interfaces/llm.js";
export type {
  SpeakOptions,
  SpeechInput,
  SpeechInputCapabilities,
  SpeechInputHandlers,
  SpeechInputOptions,
  SpeechOutput,
} from "./interfaces/speech.js";
export type * from "./interfaces/speech-provider.js";
export type {
  ClearScopeOptions,
  ClearScopeResult,
  ConversationStore,
  ListEventsOptions,
  MemoryScope,
  RetentionResult,
  SessionPage,
  StoredPreference,
} from "./interfaces/store.js";
export type { TelemetryTransport } from "./interfaces/telemetry.js";
export * from "./language.js";
export * from "./schemas/audit.js";
export * from "./schemas/common.js";
export * from "./schemas/http.js";
export * from "./schemas/protocol.js";
export * from "./schemas/speech.js";
export * from "./schemas/telemetry.js";
export {
  applyEventToSummary,
  decodeCursor,
  emptySummary,
  encodeCursor,
  isAfterCursor,
} from "./store-helpers.js";
export * from "./utils/index.js";
export * from "./vocabulary.js";

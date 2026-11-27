/**
 * Dependency-free utilities (no zod). Safe to import in browsers from `@speeq/core/utils`.
 * @packageDocumentation
 */

export { baseLanguage, guessLanguageFromScript } from "../language.js";
export { combineSignals, sleep } from "./async.js";
export { type Listener, TypedEmitter } from "./emitter.js";
export { formFillActionName } from "./form-fill.js";
export { createId } from "./ids.js";
export {
  type SafeJsonResult,
  safeJsonParse,
  safeJsonStringify,
  type TruncateResult,
  truncate,
} from "./json.js";
export {
  mapProviderHttpError,
  parseRetryAfter,
  providerFetch,
  readSseData,
} from "./provider-http.js";
export { DEFAULT_SECRET_KEYS, REDACTED, redactKeys, redactText } from "./redact.js";
export { SentenceChunker, type SentenceChunkerOptions } from "./sentence-chunker.js";
export { encodeSse, type SseMessage, SseParser } from "./sse.js";
export type { CorrectionResult, Vocabulary } from "./vocabulary.js";
export { correctWithVocabulary } from "./vocabulary.js";

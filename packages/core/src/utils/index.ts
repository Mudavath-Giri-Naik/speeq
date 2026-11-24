/**
 * Dependency-free utilities (no zod). Safe to import in browsers from `@speeq/core/utils`.
 * @packageDocumentation
 */
export { combineSignals, sleep } from "./async.js";
export { type Listener, TypedEmitter } from "./emitter.js";
export { createId } from "./ids.js";
export {
  type SafeJsonResult,
  safeJsonParse,
  safeJsonStringify,
  type TruncateResult,
  truncate,
} from "./json.js";
export { DEFAULT_SECRET_KEYS, REDACTED, redactKeys, redactText } from "./redact.js";
export { SentenceChunker, type SentenceChunkerOptions } from "./sentence-chunker.js";
export { encodeSse, type SseMessage, SseParser } from "./sse.js";

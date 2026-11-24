import type { Usage } from "../schemas/common.js";

/** A JSON Schema object (as produced by `z.toJSONSchema`). */
export type JsonSchema = Record<string, unknown>;

/** A tool call requested by the model. */
export interface LLMToolCall {
  /** Provider-assigned (or generated) id, used to match the tool result. */
  id: string;
  name: string;
  /** Parsed arguments. Providers must parse JSON; invalid JSON becomes `{ __invalidJson: raw }`. */
  arguments: unknown;
  /** Opaque provider data that must be echoed back on the next request (e.g. Gemini thought signatures). */
  providerMetadata?: Record<string, unknown>;
}

/** A normalized chat message. */
export type LLMMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: LLMToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

/** A tool the model may call. */
export interface LLMToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the arguments object. */
  parameters: JsonSchema;
}

/** One request to an {@link LLMProvider}. */
export interface LLMRequest {
  messages: LLMMessage[];
  tools: LLMToolDefinition[];
  /** Aborts the request (client disconnect, timeout). Providers must honor it. */
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
}

/** Why the model stopped. */
export type LLMFinishReason = "stop" | "tool_calls" | "length" | "content_filter" | "other";

/** One normalized streaming chunk. */
export type LLMStreamChunk =
  | { type: "text-delta"; text: string }
  /** A complete tool call. Providers assemble partial deltas before emitting it. */
  | { type: "tool-call"; call: LLMToolCall }
  | { type: "finish"; reason: LLMFinishReason; usage?: Usage };

/**
 * A chat model with streaming and tool calling.
 *
 * Implementations must throw `SpeeqError` with code `RATE_LIMITED` for HTTP 429 / quota errors
 * and `PROVIDER_ERROR` for other failures, and must stop when `request.signal` aborts.
 */
export interface LLMProvider {
  /** Short adapter id for telemetry, e.g. `openai-compatible`, `gemini`, `mock`. */
  readonly kind: string;
  /** Model id in use (from configuration). */
  readonly model: string;
  /** Streams the model's reply. Must end with exactly one `finish` chunk. */
  stream(request: LLMRequest): AsyncIterable<LLMStreamChunk>;
}

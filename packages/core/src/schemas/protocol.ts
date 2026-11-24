import { z } from "zod";
import { PROTOCOL_VERSION } from "../constants.js";
import {
  ErrorCodeSchema,
  LanguageSchema,
  ToolKindSchema,
  TurnEndReasonSchema,
  UsageSchema,
} from "./common.js";

const base = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  turnId: z.string(),
};

/** First event of every stream. */
export const TurnStartedEventSchema = z.object({
  ...base,
  type: z.literal("turn.started"),
  sessionId: z.string(),
  language: LanguageSchema,
});

/** A piece of assistant text as it is generated. */
export const AssistantDeltaEventSchema = z.object({
  ...base,
  type: z.literal("assistant.delta"),
  text: z.string(),
});

/** A complete assistant message (sent after its deltas). */
export const AssistantMessageEventSchema = z.object({
  ...base,
  type: z.literal("assistant.message"),
  messageId: z.string(),
  text: z.string(),
});

/** A tool began running. */
export const ToolStartedEventSchema = z.object({
  ...base,
  type: z.literal("tool.started"),
  callId: z.string(),
  name: z.string(),
  kind: ToolKindSchema,
});

/** A tool finished (successfully or not). */
export const ToolFinishedEventSchema = z.object({
  ...base,
  type: z.literal("tool.finished"),
  callId: z.string(),
  name: z.string(),
  ok: z.boolean(),
  durationMs: z.number().nonnegative(),
  errorCode: ErrorCodeSchema.optional(),
});

/** The client should navigate. The server never changes the page itself. */
export const NavigateEventSchema = z.object({
  ...base,
  type: z.literal("navigate"),
  routeId: z.string(),
  href: z.string(),
  params: z.record(z.string(), z.unknown()),
});

/** A write tool is waiting for the user's approval. The stream ends after this event. */
export const ConfirmationRequiredEventSchema = z.object({
  ...base,
  type: z.literal("confirmation.required"),
  confirmationId: z.string(),
  toolName: z.string(),
  /** Human-readable summary of what will happen, for the confirmation dialog. */
  summary: z.string(),
  args: z.unknown(),
});

/** A recoverable or terminal error. Messages are always safe to show to users. */
export const ErrorEventSchema = z.object({
  ...base,
  type: z.literal("error"),
  code: ErrorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
  retryAfterMs: z.number().int().nonnegative().optional(),
});

/** Last event of every stream. */
export const TurnFinishedEventSchema = z.object({
  ...base,
  type: z.literal("turn.finished"),
  reason: TurnEndReasonSchema,
  latencyMs: z.number().nonnegative(),
  firstTokenMs: z.number().nonnegative().optional(),
  usage: UsageSchema.optional(),
});

/** Every event the server may stream to the client (SSE `event:` = `type`). */
export const ProtocolEventSchema = z.discriminatedUnion("type", [
  TurnStartedEventSchema,
  AssistantDeltaEventSchema,
  AssistantMessageEventSchema,
  ToolStartedEventSchema,
  ToolFinishedEventSchema,
  NavigateEventSchema,
  ConfirmationRequiredEventSchema,
  ErrorEventSchema,
  TurnFinishedEventSchema,
]);

/** Every event the server may stream to the client. */
export type ProtocolEvent = z.infer<typeof ProtocolEventSchema>;
/** The `type` of a {@link ProtocolEvent}. */
export type ProtocolEventType = ProtocolEvent["type"];
/** Narrows {@link ProtocolEvent} by `type`. */
export type ProtocolEventOf<T extends ProtocolEventType> = Extract<ProtocolEvent, { type: T }>;
/** A protocol event before `protocolVersion` and `turnId` are filled in. */
export type ProtocolEventInput = ProtocolEvent extends infer E
  ? E extends ProtocolEvent
    ? Omit<E, "protocolVersion" | "turnId">
    : never
  : never;

/** All protocol event types, in a stable order. */
export const PROTOCOL_EVENT_TYPES = [
  "turn.started",
  "assistant.delta",
  "assistant.message",
  "tool.started",
  "tool.finished",
  "navigate",
  "confirmation.required",
  "error",
  "turn.finished",
] as const satisfies readonly ProtocolEventType[];

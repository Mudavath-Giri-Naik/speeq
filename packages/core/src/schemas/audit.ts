import { z } from "zod";
import {
  ErrorCodeSchema,
  InputModeSchema,
  LanguageSchema,
  PageContextSchema,
  SessionCapabilitySchema,
  ToolKindSchema,
  TurnEndReasonSchema,
  UiResultStatusSchema,
  UsageSchema,
} from "./common.js";

/** A tool call as recorded on an assistant message. */
export const RecordedToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  args: z.unknown(),
  /** Opaque provider data that must be sent back (e.g. Gemini thought signatures). */
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
});
/** A tool call as recorded on an assistant message. */
export type RecordedToolCall = z.infer<typeof RecordedToolCallSchema>;

const ev = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({ type: z.literal(type), data });

/** Every audit event type and the shape of its `data`. */
export const ConversationEventBodySchema = z.discriminatedUnion("type", [
  ev(
    "session.started",
    z.object({
      userId: z.string().nullable(),
      language: LanguageSchema,
      context: PageContextSchema.optional(),
      capabilities: z.array(SessionCapabilitySchema).optional(),
    }),
  ),
  ev(
    "user.message",
    z.object({
      text: z.string(),
      language: LanguageSchema,
      inputMode: InputModeSchema.optional(),
      context: PageContextSchema.optional(),
    }),
  ),
  ev(
    "assistant.message",
    z.object({ text: z.string(), toolCalls: z.array(RecordedToolCallSchema).optional() }),
  ),
  ev(
    "tool.called",
    z.object({
      callId: z.string(),
      name: z.string(),
      kind: ToolKindSchema,
      args: z.unknown(),
      durationMs: z.number().nonnegative(),
      ok: z.boolean(),
      errorCode: ErrorCodeSchema.optional(),
      /** The (truncated) result text the model saw. */
      result: z.string().optional(),
      truncated: z.boolean().optional(),
    }),
  ),
  ev(
    "navigation",
    z.object({ routeId: z.string(), href: z.string(), params: z.record(z.string(), z.unknown()) }),
  ),
  ev(
    "confirmation.requested",
    z.object({
      confirmationId: z.string(),
      callId: z.string(),
      toolName: z.string(),
      args: z.unknown(),
      summary: z.string(),
    }),
  ),
  ev(
    "confirmation.resolved",
    z.object({ confirmationId: z.string(), approved: z.boolean(), userId: z.string().nullable() }),
  ),
  ev(
    "ui.action.requested",
    z.object({
      callId: z.string(),
      /** The model's tool call id, so the result can be attached to it. */
      toolCallId: z.string(),
      name: z.string(),
      args: z.unknown(),
      summary: z.string(),
      confirm: z.boolean(),
    }),
  ),
  ev(
    "ui.action.resolved",
    z.object({
      callId: z.string(),
      status: UiResultStatusSchema,
      userId: z.string().nullable(),
      reason: z.literal("superseded").optional(),
    }),
  ),
  ev("error", z.object({ code: ErrorCodeSchema, message: z.string() })),
  ev(
    "turn.finished",
    z.object({
      reason: TurnEndReasonSchema,
      latencyMs: z.number().nonnegative(),
      firstTokenMs: z.number().nonnegative().optional(),
      usage: UsageSchema.optional(),
      steps: z.number().int().nonnegative().optional(),
    }),
  ),
]);

const eventMeta = {
  /** Unique event id. */
  id: z.string(),
  sessionId: z.string(),
  /** ISO 8601 timestamp. */
  ts: z.string(),
  /** Turn this event belongs to (absent for `session.started`). */
  turnId: z.string().optional(),
  /** The user who owns the session (`null` for anonymous). */
  userId: z.string().nullable(),
  /**
   * Optional idempotency key. A store must reject a second event with the same key in the same
   * session with `SpeeqError("CONFLICT")`. Used to resolve each confirmation exactly once.
   */
  dedupeKey: z.string().optional(),
};

/** An audit event before the store assigns its sequence number. */
export const NewConversationEventSchema = z.intersection(
  z.object(eventMeta),
  ConversationEventBodySchema,
);
/** An audit event before the store assigns its sequence number. */
export type NewConversationEvent = z.infer<typeof NewConversationEventSchema>;

/** A stored audit event. `seq` is assigned by the store and orders events in a session. */
export const ConversationEventSchema = z.intersection(
  z.object({ ...eventMeta, seq: z.number().int().nonnegative() }),
  ConversationEventBodySchema,
);
/** A stored audit event. */
export type ConversationEvent = z.infer<typeof ConversationEventSchema>;
/** The `type` of a {@link ConversationEvent}. */
export type ConversationEventType = ConversationEvent["type"];
/** Narrows {@link ConversationEvent} by `type`. */
export type ConversationEventOf<T extends ConversationEventType> = Extract<
  ConversationEvent,
  { type: T }
>;
/** Narrows {@link NewConversationEvent} by `type`. */
export type NewConversationEventOf<T extends ConversationEventType> = Extract<
  NewConversationEvent,
  { type: T }
>;

/** A session as stored when it is created. */
export const NewSessionSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  /** Tenant of the user, or `null`. Optional so records written before 0.12 still parse. */
  tenantId: z.string().nullable().optional(),
  language: LanguageSchema,
  startedAt: z.string(),
});
/** A session as stored when it is created. */
export type NewSession = z.infer<typeof NewSessionSchema>;

/** One row in the audit session list. */
export const SessionSummarySchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  /** Tenant of the user, or `null` (also for sessions stored before 0.12). */
  tenantId: z.string().nullable().optional(),
  language: LanguageSchema,
  startedAt: z.string(),
  lastEventAt: z.string(),
  eventCount: z.number().int().nonnegative(),
  turnCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  navigationCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  /** First user message, cut to 140 characters, for list previews. */
  preview: z.string().optional(),
  /** Set when the user cleared their memory (0.12+): never resumed, shown or sent to the model. */
  forgottenAt: z.string().optional(),
});
/** One row in the audit session list. */
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/** Filter for listing sessions. Dates are ISO strings. */
export const SessionFilterSchema = z.object({
  userId: z.string().optional(),
  tenantId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
/** Filter for listing sessions. */
export type SessionFilter = z.infer<typeof SessionFilterSchema>;

/** Response of `GET /audit/sessions`. */
export const SessionListResponseSchema = z.object({
  sessions: z.array(SessionSummarySchema),
  nextCursor: z.string().nullable(),
});
/** Response of `GET /audit/sessions`. */
export type SessionListResponse = z.infer<typeof SessionListResponseSchema>;

/** Response of `GET /audit/sessions/:id`. */
export const SessionDetailResponseSchema = z.object({
  session: SessionSummarySchema,
  events: z.array(ConversationEventSchema),
});
/** Response of `GET /audit/sessions/:id`. */
export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;

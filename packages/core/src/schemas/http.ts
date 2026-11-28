import { z } from "zod";
import { PROTOCOL_VERSION } from "../constants.js";
import { ERROR_REASONS } from "../errors.js";
import {
  ErrorCodeSchema,
  InputModeSchema,
  LanguageSchema,
  PageContextSchema,
  SessionCapabilitySchema,
  UiResultStatusSchema,
} from "./common.js";

/** Maximum length of one user message, in characters. */
export const MAX_TURN_TEXT_CHARS = 2000;

/** Body of `POST /session` (all fields optional). */
export const CreateSessionRequestSchema = z.object({
  language: LanguageSchema.optional(),
  context: PageContextSchema.optional(),
  /** Optional protocol features this client understands. Unlisted features are never used. */
  capabilities: z.array(SessionCapabilitySchema).max(4).optional(),
  /**
   * Continue the signed-in user's latest conversation if the server keeps persistent memory (0.12+).
   * The server chooses the session; the client never names one.
   */
  resume: z.boolean().optional(),
});
/** Body of `POST /session`. */
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/**
 * Greeting and starter prompts for one visitor, computed by the server from configured templates
 * and approved values (0.12+). `text` may be empty when only starters are configured.
 */
export const ClientGreetingSchema = z.object({
  text: z.string().max(300),
  starters: z.array(z.object({ label: z.string().max(60), prompt: z.string().max(300) })).max(6),
  frequency: z.enum(["once-per-session", "every-open"]),
  delayMs: z.number().int().nonnegative().max(10_000),
});
/** Greeting and starter prompts for one visitor. */
export type ClientGreeting = z.infer<typeof ClientGreetingSchema>;

/** What the server remembers for this visitor (0.12+). All false for anonymous visitors. */
export const ClientMemorySchema = z.object({
  /** A previous conversation can be continued (persistent memory, signed in). */
  resume: z.boolean(),
  /** The visitor can clear what is kept about them. */
  clear: z.boolean(),
  /** Stated preferences are kept. */
  preferences: z.boolean(),
});
/** What the server remembers for this visitor. */
export type ClientMemory = z.infer<typeof ClientMemorySchema>;

/** Public configuration the client receives when a session starts. */
export const ClientConfigSchema = z.object({
  speech: z
    .object({ stt: z.boolean(), tts: z.boolean(), detectsLanguage: z.boolean().optional() })
    .optional(),
  agentName: z.string(),
  languages: z.array(LanguageSchema).min(1),
  defaultLanguage: LanguageSchema,
  features: z.object({
    navigation: z.boolean(),
    knowledge: z.boolean(),
    tools: z.boolean(),
    audit: z.boolean(),
  }),
  /** Routes the agent can open (id + title only), for UI hints such as "try saying…". */
  routes: z.array(z.object({ id: z.string(), title: z.string() })),
  /** Absent when the server configures no greeting or starters, or is older than 0.12. */
  greeting: ClientGreetingSchema.optional(),
  /** Absent from servers older than 0.12. */
  memory: ClientMemorySchema.optional(),
});
/** Public configuration the client receives when a session starts. */
export type ClientConfig = z.infer<typeof ClientConfigSchema>;

/**
 * Who the server says is talking. `fingerprint` is opaque (an HMAC on the server); it only lets the
 * browser notice that the signed-in user or tenant changed. `profile` holds only fields the server
 * config exposes.
 */
export const IdentitySummarySchema = z.object({
  state: z.enum(["anonymous", "authenticated"]),
  fingerprint: z.string().min(1).max(32),
  profile: z
    .object({
      displayName: z.string().max(80).optional(),
      preferredName: z.string().max(80).optional(),
      locale: z.string().max(35).optional(),
    })
    .optional(),
});
/** Who the server says is talking. */
export type IdentitySummary = z.infer<typeof IdentitySummarySchema>;

/** Response of `GET /identity`. */
export const IdentityResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  identity: IdentitySummarySchema,
  /** Greeting for this visitor and page (`?path=`), when configured. */
  greeting: ClientGreetingSchema.optional(),
  /** What the server remembers for this visitor (0.12+). */
  memory: ClientMemorySchema.optional(),
});
/** Response of `GET /identity`. */
export type IdentityResponse = z.infer<typeof IdentityResponseSchema>;

/** Response of `POST /session`. */
export const CreateSessionResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  sessionId: z.string(),
  sessionToken: z.string(),
  /** ISO timestamp after which the token is rejected with `SESSION_EXPIRED`. */
  expiresAt: z.string(),
  config: ClientConfigSchema,
  /** Absent from servers older than 0.12. */
  identity: IdentitySummarySchema.optional(),
  /** True when this is the user's earlier conversation, continued (persistent memory). */
  resumed: z.boolean().optional(),
});
/** Response of `POST /session`. */
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

/** One line of a stored transcript: user and assistant text only. */
export const TranscriptMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  ts: z.string(),
});
/** One line of a stored transcript. */
export type TranscriptMessage = z.infer<typeof TranscriptMessageSchema>;

/** Response of `GET /session/:id/messages`. */
export const SessionMessagesResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  messages: z.array(TranscriptMessageSchema),
});
/** Response of `GET /session/:id/messages`. */
export type SessionMessagesResponse = z.infer<typeof SessionMessagesResponseSchema>;

/** Body of `DELETE /session/:id/memory`. */
export const ClearMemoryRequestSchema = z.object({
  /** Also delete stated preferences. Default true. */
  preferences: z.boolean().optional(),
});
/** Body of `DELETE /session/:id/memory`. */
export type ClearMemoryRequest = z.infer<typeof ClearMemoryRequestSchema>;

/** Response of `DELETE /session/:id/memory`. */
export const ClearMemoryResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  sessions: z.number().int().nonnegative(),
  preferences: z.number().int().nonnegative(),
});
/** Response of `DELETE /session/:id/memory`. */
export type ClearMemoryResponse = z.infer<typeof ClearMemoryResponseSchema>;

/** Body of `POST /session/:id/turn`. */
export const TurnRequestSchema = z.object({
  inputLanguage: LanguageSchema.optional(),
  transcript: z
    .object({
      raw: z.string().max(MAX_TURN_TEXT_CHARS * 4),
      confidence: z.number().min(0).max(1).optional(),
      provider: z.string().max(200).optional(),
      corrected: z.boolean().optional(),
      ambiguous: z.array(z.string().max(2000)).max(200).optional(),
    })
    .optional(),
  text: z.string().trim().min(1).max(MAX_TURN_TEXT_CHARS),
  language: LanguageSchema,
  context: PageContextSchema.optional(),
  /** Used only for anonymous counters (voice vs text usage). Defaults to `text`. */
  inputMode: InputModeSchema.optional(),
});
/** Body of `POST /session/:id/turn`. */
export type TurnRequest = z.infer<typeof TurnRequestSchema>;

/** Body of `POST /session/:id/confirm`. */
export const ConfirmRequestSchema = z.object({
  confirmationId: z.string().min(1).max(200),
  approved: z.boolean(),
});
/** Body of `POST /session/:id/confirm`. */
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>;

/** Body of `POST /session/:id/ui-result`. */
export const UiResultRequestSchema = z.object({
  callId: z.string().min(1).max(200),
  status: UiResultStatusSchema,
  /** JSON the handler returned. The server keeps at most 2048 bytes of it. */
  result: z.unknown().optional(),
});
/** Body of `POST /session/:id/ui-result`. */
export type UiResultRequest = z.infer<typeof UiResultRequestSchema>;

/** JSON error body for non-streaming endpoints. */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    retryAfterMs: z.number().optional(),
    /** Stable refinement of `code` (0.12+). */
    reason: z.enum(ERROR_REASONS).optional(),
  }),
});
/** JSON error body for non-streaming endpoints. */
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** Response of `GET /health`. */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  sdkVersion: z.string(),
});
/** Response of `GET /health`. */
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

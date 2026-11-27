import { z } from "zod";
import { PROTOCOL_VERSION } from "../constants.js";
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
});
/** Body of `POST /session`. */
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

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
});
/** Response of `POST /session`. */
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

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

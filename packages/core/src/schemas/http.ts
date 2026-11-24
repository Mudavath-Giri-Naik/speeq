import { z } from "zod";
import { PROTOCOL_VERSION } from "../constants.js";
import { ErrorCodeSchema, InputModeSchema, LanguageSchema, PageContextSchema } from "./common.js";

/** Maximum length of one user message, in characters. */
export const MAX_TURN_TEXT_CHARS = 2000;

/** Body of `POST /session` (all fields optional). */
export const CreateSessionRequestSchema = z.object({
  language: LanguageSchema.optional(),
  context: PageContextSchema.optional(),
});
/** Body of `POST /session`. */
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/** Public configuration the client receives when a session starts. */
export const ClientConfigSchema = z.object({
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

/** Response of `POST /session`. */
export const CreateSessionResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  sessionId: z.string(),
  sessionToken: z.string(),
  /** ISO timestamp after which the token is rejected with `SESSION_EXPIRED`. */
  expiresAt: z.string(),
  config: ClientConfigSchema,
});
/** Response of `POST /session`. */
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

/** Body of `POST /session/:id/turn`. */
export const TurnRequestSchema = z.object({
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

import { z } from "zod";
import { ERROR_CODES } from "../errors.js";

/** A BCP 47 language tag such as `en-IN`, `te-IN` or `hi-IN`. */
export const LanguageSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "Expected a BCP 47 language tag like en-IN");
/** A BCP 47 language tag. */
export type Language = z.infer<typeof LanguageSchema>;

/** Every stable error code as a Zod enum. */
export const ErrorCodeSchema = z.enum(ERROR_CODES);

/**
 * Where the user is in the host app. Sent with every turn so the agent can answer
 * "what is on this page" and resolve phrases like "this question".
 */
export const PageContextSchema = z.object({
  /** Current path, e.g. `/practice?subject=physics`. */
  path: z.string().max(2048),
  /** Document title. */
  title: z.string().max(300).optional(),
  /** Any developer-provided data (e.g. the id of the question on screen). Keep it small. */
  data: z.record(z.string(), z.unknown()).optional(),
});
/** Where the user is in the host app. */
export type PageContext = z.infer<typeof PageContextSchema>;

/** Token usage reported by an LLM provider, if available. */
export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});
/** Token usage reported by an LLM provider. */
export type Usage = z.infer<typeof UsageSchema>;

/** Whether a turn started from speech or typed text. */
export const InputModeSchema = z.enum(["voice", "text"]);
/** Whether a turn started from speech or typed text. */
export type InputMode = z.infer<typeof InputModeSchema>;

/** Why a turn ended. */
export const TurnEndReasonSchema = z.enum([
  "completed",
  "max_steps",
  "confirmation_required",
  "ui_action_required",
  "error",
  "aborted",
]);
/** Why a turn ended. */
export type TurnEndReason = z.infer<typeof TurnEndReasonSchema>;

/** Optional protocol features a client declares when it creates a session. */
export const SessionCapabilitySchema = z.enum(["ui-actions"]);
/** Optional protocol features a client declares when it creates a session. */
export type SessionCapability = z.infer<typeof SessionCapabilitySchema>;

/** Outcome a client reports for a UI action. */
export const UiResultStatusSchema = z.enum(["done", "declined", "failed", "unavailable"]);
/** Outcome a client reports for a UI action. */
export type UiResultStatus = z.infer<typeof UiResultStatusSchema>;

/** Whether a tool ships with speeq (`navigate`, `search_knowledge`) or is developer-defined. */
export const ToolKindSchema = z.enum(["builtin", "custom"]);
/** Whether a tool is built in or developer-defined. */
export type ToolKind = z.infer<typeof ToolKindSchema>;

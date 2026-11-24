/**
 * Errors shared by every speeq package. This module has no dependencies (no zod), so browser
 * code can import it from `@speeq/core/errors` without pulling in schemas.
 */

/** Every stable error code. Codes are part of the public protocol. Never rename one. */
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INVALID_INPUT",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "TOOL_ERROR",
  "TOOL_TIMEOUT",
  "CONFIRMATION_REQUIRED",
  "SESSION_EXPIRED",
  "NOT_CONFIGURED",
  "INTERNAL",
] as const;

/** A stable, machine-readable error code. */
export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status used when an error with this code is returned as a plain JSON response. */
export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_ERROR: 502,
  TOOL_ERROR: 500,
  TOOL_TIMEOUT: 504,
  CONFIRMATION_REQUIRED: 409,
  SESSION_EXPIRED: 401,
  NOT_CONFIGURED: 500,
  INTERNAL: 500,
};

/** Friendly default messages that are always safe to show to end users. */
export const DEFAULT_ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You are not allowed to do that.",
  INVALID_INPUT: "The request was not valid.",
  NOT_FOUND: "That could not be found.",
  CONFLICT: "That was already handled.",
  RATE_LIMITED: "The assistant is busy right now. Please try again in a moment.",
  PROVIDER_ERROR: "The AI provider had a problem. Please try again.",
  TOOL_ERROR: "An action failed to run.",
  TOOL_TIMEOUT: "An action took too long and was stopped.",
  CONFIRMATION_REQUIRED: "This action needs your confirmation.",
  SESSION_EXPIRED: "Your session expired. Starting a new one.",
  NOT_CONFIGURED: "The assistant is not configured correctly.",
  INTERNAL: "Something went wrong.",
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  "RATE_LIMITED",
  "PROVIDER_ERROR",
  "TOOL_TIMEOUT",
  "SESSION_EXPIRED",
]);

/** Options for constructing a {@link SpeeqError}. */
export interface SpeeqErrorOptions {
  /** Public, user-safe message. Defaults to {@link DEFAULT_ERROR_MESSAGES}. */
  message?: string;
  /** Whether retrying the same request may succeed. Defaults by code. */
  retryable?: boolean;
  /** Suggested wait before retrying, in milliseconds. */
  retryAfterMs?: number;
  /** The underlying error. Kept for server logs, never serialized to clients. */
  cause?: unknown;
  /** Extra structured detail for logs (never sent to clients). */
  details?: Record<string, unknown>;
}

/** The single error type used across speeq. Always carries a stable {@link ErrorCode}. */
export class SpeeqError extends Error {
  /** Brand used by {@link isSpeeqError} so checks work across bundled copies. */
  readonly isSpeeqError = true as const;
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, options: SpeeqErrorOptions = {}) {
    super(options.message ?? DEFAULT_ERROR_MESSAGES[code], { cause: options.cause });
    this.name = "SpeeqError";
    this.code = code;
    this.retryable = options.retryable ?? RETRYABLE.has(code);
    this.retryAfterMs = options.retryAfterMs;
    this.details = options.details;
  }

  /** HTTP status for this error. */
  get status(): number {
    return ERROR_HTTP_STATUS[this.code];
  }
}

/** True if `value` is a {@link SpeeqError} (works across duplicated package copies). */
export function isSpeeqError(value: unknown): value is SpeeqError {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { isSpeeqError?: unknown }).isSpeeqError === true &&
    typeof (value as { code?: unknown }).code === "string"
  );
}

/** True if `value` is one of the known {@link ERROR_CODES}. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/** The client-safe shape of an error, as sent over the wire. */
export interface PublicError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
}

/**
 * Converts anything thrown into a {@link SpeeqError}. Unknown errors become `INTERNAL` with the
 * generic message, so raw messages and stack traces never reach clients.
 */
export function toSpeeqError(error: unknown, fallback: ErrorCode = "INTERNAL"): SpeeqError {
  if (isSpeeqError(error)) return error;
  if (isAbortError(error))
    return new SpeeqError("INTERNAL", { message: "Cancelled.", cause: error });
  return new SpeeqError(fallback, { cause: error });
}

/** Serializes an error to its {@link PublicError} form (safe to send to the browser). */
export function toPublicError(error: unknown): PublicError {
  const e = toSpeeqError(error);
  const out: PublicError = { code: e.code, message: e.message, retryable: e.retryable };
  if (e.retryAfterMs !== undefined) out.retryAfterMs = e.retryAfterMs;
  return out;
}

/** True for `AbortError`s raised by `AbortSignal` / `fetch`. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { name?: unknown }).name === "AbortError" ||
      (error as { name?: unknown }).name === "TimeoutError")
  );
}

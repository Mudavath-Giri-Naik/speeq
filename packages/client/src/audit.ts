import type {
  ConversationEvent,
  SessionDetailResponse,
  SessionFilter,
  SessionListResponse,
  SessionSummary,
} from "@speeq/core";
import { isErrorCode, SpeeqError } from "@speeq/core/errors";

/** Connection options for the developer's audit endpoints. */
export interface AuditClientOptions {
  endpoint: string;
  fetch?: typeof fetch;
  /** Default "include". */
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
}

/** Session list filters and optional pagination cursor. */
export interface AuditListParams {
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string | null;
}

/** Reads authorized session summaries and event histories. */
export interface AuditClient {
  listSessions(params?: AuditListParams, signal?: AbortSignal): Promise<SessionListResponse>;
  getSession(sessionId: string, signal?: AbortSignal): Promise<SessionDetailResponse>;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function aborted(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (record(error) && error.name === "AbortError");
}

/** Creates a client that uses the host application's audit authorization. */
export function createAuditClient(options: AuditClientOptions): AuditClient {
  const endpoint = options.endpoint.replace(/\/+$/, "");
  async function get<T>(
    path: string,
    signal: AbortSignal | undefined,
    valid: (data: unknown) => data is T,
  ): Promise<T> {
    let response: Response;
    try {
      response = await (options.fetch ?? globalThis.fetch)(endpoint + path, {
        method: "GET",
        credentials: options.credentials ?? "include",
        headers: options.headers,
        signal,
      });
    } catch (error) {
      if (aborted(error, signal)) throw error;
      throw new SpeeqError("INTERNAL", { message: "Could not reach the server.", retryable: true });
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      if (aborted(error, signal)) throw error;
      throw new SpeeqError("INTERNAL");
    }
    if (!response.ok) {
      const error = record(data) ? data.error : undefined;
      if (
        record(error) &&
        isErrorCode(error.code) &&
        typeof error.message === "string" &&
        typeof error.retryable === "boolean"
      ) {
        throw new SpeeqError(error.code, { message: error.message, retryable: error.retryable });
      }
      throw new SpeeqError("INTERNAL");
    }
    if (!valid(data)) throw new SpeeqError("INTERNAL");
    return data;
  }

  return {
    listSessions(params = {}, signal) {
      const query = new URLSearchParams();
      for (const key of ["userId", "from", "to", "limit", "cursor"] as const) {
        const value = params[key];
        if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
      }
      const suffix = query.size ? `?${query}` : "";
      return get(
        `/audit/sessions${suffix}`,
        signal,
        (data): data is SessionListResponse => record(data) && Array.isArray(data.sessions),
      );
    },
    getSession(id, signal) {
      return get(
        `/audit/sessions/${encodeURIComponent(id)}`,
        signal,
        (data): data is SessionDetailResponse =>
          record(data) && record(data.session) && Array.isArray(data.events),
      );
    },
  };
}

export type {
  ConversationEvent,
  SessionDetailResponse,
  SessionFilter,
  SessionListResponse,
  SessionSummary,
};

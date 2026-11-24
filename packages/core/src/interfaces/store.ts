import type {
  ConversationEvent,
  NewConversationEvent,
  NewSession,
  SessionFilter,
  SessionSummary,
} from "../schemas/audit.js";

/** A page of sessions. */
export interface SessionPage {
  sessions: SessionSummary[];
  /** Pass to the next `listSessions` call, or `null` when there are no more. */
  nextCursor: string | null;
}

/** Options for {@link ConversationStore.listEvents}. */
export interface ListEventsOptions {
  /** Return only events with `seq` greater than this. */
  afterSeq?: number;
  /** Return at most this many events (the most recent ones when `last` is true). */
  limit?: number;
  /** With `limit`, return the last `limit` events instead of the first. */
  last?: boolean;
}

/** Result of {@link ConversationStore.deleteOlderThan}. */
export interface RetentionResult {
  sessions: number;
  events: number;
}

/**
 * Persists conversations. The same store is the audit log and the source of conversation
 * history for the agent. It lives in the developer's own infrastructure.
 *
 * Contract (checked by `runConversationStoreContract` in `@speeq/testing`):
 * - `appendEvents` assigns increasing `seq` numbers per session, atomically.
 * - An event whose `dedupeKey` already exists in the session is rejected with
 *   `SpeeqError("CONFLICT")`, and no event of that call is written.
 * - `listEvents` returns events ordered by `seq`.
 * - `listSessions` returns newest sessions first and pages with an opaque cursor.
 */
export interface ConversationStore {
  /** Short adapter id for telemetry, e.g. `memory` or `mongodb`. */
  readonly kind: string;
  createSession(session: NewSession): Promise<void>;
  appendEvents(sessionId: string, events: NewConversationEvent[]): Promise<ConversationEvent[]>;
  listEvents(sessionId: string, options?: ListEventsOptions): Promise<ConversationEvent[]>;
  listSessions(filter: SessionFilter, cursor?: string | null): Promise<SessionPage>;
  getSessionSummary(sessionId: string): Promise<SessionSummary | null>;
  /** Deletes sessions (and their events) whose last activity is older than `date`. */
  deleteOlderThan(date: Date): Promise<RetentionResult>;
}

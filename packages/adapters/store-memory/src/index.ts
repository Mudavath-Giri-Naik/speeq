/**
 * `@speeq/store-memory`: a Map-based {@link ConversationStore} for development and tests.
 *
 * **Not for production or serverless.** Data lives in one process's memory: it is lost on
 * restart, and serverless platforms run many short-lived instances that do not share it.
 * Use `@speeq/store-mongodb` (or your own adapter) in production.
 * @packageDocumentation
 */
import {
  applyEventToSummary,
  type ConversationEvent,
  type ConversationStore,
  decodeCursor,
  emptySummary,
  encodeCursor,
  isAfterCursor,
  type ListEventsOptions,
  type NewConversationEvent,
  type NewSession,
  type RetentionResult,
  type SessionFilter,
  type SessionPage,
  type SessionSummary,
  SpeeqError,
} from "@speeq/core";

/** Options for {@link createMemoryStore}. */
export interface MemoryStoreOptions {
  /** Silence the one-time "not for production" warning. */
  quiet?: boolean;
}

interface Entry {
  summary: SessionSummary;
  events: ConversationEvent[];
  dedupeKeys: Set<string>;
}

let warned = false;

/** An in-memory {@link ConversationStore}. See the package docs for its limits. */
export class MemoryStore implements ConversationStore {
  readonly kind = "memory";
  private readonly sessions = new Map<string, Entry>();

  constructor(options: MemoryStoreOptions = {}) {
    if (!options.quiet && !warned && isProduction()) {
      warned = true;
      console.warn(
        "[speeq] @speeq/store-memory is for development and tests only. Data is lost on restart and is not shared between serverless instances.",
      );
    }
  }

  async createSession(session: NewSession): Promise<void> {
    if (this.sessions.has(session.id))
      throw new SpeeqError("CONFLICT", { message: "Session exists." });
    this.sessions.set(session.id, {
      summary: emptySummary(session),
      events: [],
      dedupeKeys: new Set(),
    });
  }

  async appendEvents(
    sessionId: string,
    events: NewConversationEvent[],
  ): Promise<ConversationEvent[]> {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new SpeeqError("NOT_FOUND", { message: "Session not found." });
    const keys = events.map((e) => e.dedupeKey).filter((k): k is string => k !== undefined);
    if (keys.some((k) => entry.dedupeKeys.has(k)) || new Set(keys).size !== keys.length) {
      throw new SpeeqError("CONFLICT");
    }
    const stored = events.map(
      (e, i) => ({ ...e, seq: entry.events.length + i }) as ConversationEvent,
    );
    for (const e of stored) {
      entry.events.push(structuredClone(e));
      entry.summary = applyEventToSummary(entry.summary, e);
    }
    for (const k of keys) entry.dedupeKeys.add(k);
    return stored;
  }

  async listEvents(
    sessionId: string,
    options: ListEventsOptions = {},
  ): Promise<ConversationEvent[]> {
    const all = this.sessions.get(sessionId)?.events ?? [];
    let out =
      options.afterSeq === undefined ? all : all.filter((e) => e.seq > (options.afterSeq ?? -1));
    if (options.limit !== undefined) {
      out = options.last ? out.slice(-options.limit) : out.slice(0, options.limit);
    }
    return structuredClone(out);
  }

  async listSessions(filter: SessionFilter, cursor?: string | null): Promise<SessionPage> {
    const limit = filter.limit ?? 20;
    const after = cursor ? decodeCursor(cursor) : null;
    const matching = [...this.sessions.values()]
      .map((e) => e.summary)
      .filter((s) => filter.userId === undefined || s.userId === filter.userId)
      .filter((s) => filter.from === undefined || s.startedAt >= filter.from)
      .filter((s) => filter.to === undefined || s.startedAt <= filter.to)
      .filter((s) => after === null || isAfterCursor(s, after))
      .sort((a, b) =>
        a.startedAt === b.startedAt ? (a.id < b.id ? 1 : -1) : a.startedAt < b.startedAt ? 1 : -1,
      );
    const page = matching.slice(0, limit);
    const last = page.at(-1);
    return {
      sessions: structuredClone(page),
      nextCursor: matching.length > limit && last ? encodeCursor(last.startedAt, last.id) : null,
    };
  }

  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    const s = this.sessions.get(sessionId)?.summary;
    return s ? structuredClone(s) : null;
  }

  async deleteOlderThan(date: Date): Promise<RetentionResult> {
    const cutoff = date.toISOString();
    const result: RetentionResult = { sessions: 0, events: 0 };
    for (const [id, entry] of this.sessions) {
      if (entry.summary.lastEventAt < cutoff) {
        result.sessions += 1;
        result.events += entry.events.length;
        this.sessions.delete(id);
      }
    }
    return result;
  }
}

/**
 * Creates an in-memory store. In Next.js dev mode, keep one instance on `globalThis` so hot
 * reloads do not wipe it (see the demo app).
 */
export function createMemoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  return new MemoryStore(options);
}

function isProduction(): boolean {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.NODE_ENV === "production";
}

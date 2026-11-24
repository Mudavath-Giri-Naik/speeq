/**
 * `@speeq/store-mongodb`: a {@link ConversationStore} on your existing MongoDB connection.
 * It reuses the `Db` your app already has, so there is no second connection pool.
 * @packageDocumentation
 */
import {
  type ConversationEvent,
  type ConversationStore,
  decodeCursor,
  encodeCursor,
  type ListEventsOptions,
  type NewConversationEvent,
  type NewSession,
  type RetentionResult,
  type SessionFilter,
  type SessionPage,
  type SessionSummary,
  SpeeqError,
} from "@speeq/core";
import type { Collection, Db, Filter } from "mongodb";

/** Options for {@link createMongoStore}. */
export interface MongoStoreOptions {
  /** Your app's `Db`, a promise of it, or a function returning one (e.g. from a cached client). */
  db: Db | Promise<Db> | (() => Db | Promise<Db>);
  /** Collection name prefix. Default `speeq_` → `speeq_sessions`, `speeq_events`. */
  collectionPrefix?: string;
  /** Create indexes on first use. Default `true`. Set `false` if you manage indexes yourself. */
  ensureIndexes?: boolean;
}

/** Stored session document. */
interface SessionDoc extends Omit<SessionSummary, "id"> {
  _id: string;
  nextSeq: number;
}

/** Stored event document. */
type EventDoc = Omit<ConversationEvent, "id"> & { _id: string };

const DUPLICATE_KEY = 11000;

function isDuplicateKey(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; writeErrors?: Array<{ code?: unknown }> };
  return e.code === DUPLICATE_KEY || (e.writeErrors ?? []).some((w) => w.code === DUPLICATE_KEY);
}

function toSummary(doc: SessionDoc): SessionSummary {
  const { _id, nextSeq: _seq, ...rest } = doc;
  return { id: _id, ...rest };
}

function toEvent(doc: EventDoc): ConversationEvent {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as ConversationEvent;
}

function counterDelta(events: NewConversationEvent[]) {
  const inc = {
    eventCount: events.length,
    turnCount: 0,
    toolCallCount: 0,
    navigationCount: 0,
    errorCount: 0,
  };
  for (const e of events) {
    if (e.type === "user.message") inc.turnCount += 1;
    else if (e.type === "tool.called") inc.toolCallCount += 1;
    else if (e.type === "navigation") inc.navigationCount += 1;
    else if (e.type === "error") inc.errorCount += 1;
  }
  return inc;
}

/** A MongoDB-backed {@link ConversationStore}. Create it with {@link createMongoStore}. */
export class MongoStore implements ConversationStore {
  readonly kind = "mongodb";
  private ready: Promise<{
    sessions: Collection<SessionDoc>;
    events: Collection<EventDoc>;
  }> | null = null;

  constructor(private readonly options: MongoStoreOptions) {}

  private collections() {
    this.ready ??= (async () => {
      const source = this.options.db;
      const db = await (typeof source === "function" ? source() : source);
      const prefix = this.options.collectionPrefix ?? "speeq_";
      const sessions = db.collection<SessionDoc>(`${prefix}sessions`);
      const events = db.collection<EventDoc>(`${prefix}events`);
      if (this.options.ensureIndexes !== false) {
        await Promise.all([
          events.createIndex({ sessionId: 1, seq: 1 }, { unique: true, name: "session_seq" }),
          events.createIndex(
            { sessionId: 1, dedupeKey: 1 },
            {
              unique: true,
              name: "session_dedupe",
              partialFilterExpression: { dedupeKey: { $type: "string" } },
            },
          ),
          events.createIndex({ ts: 1 }, { name: "ts" }),
          sessions.createIndex({ userId: 1, startedAt: -1 }, { name: "user_started" }),
          sessions.createIndex({ startedAt: -1, _id: -1 }, { name: "started" }),
          sessions.createIndex({ lastEventAt: 1 }, { name: "last_event" }),
        ]);
      }
      return { sessions, events };
    })().catch((error: unknown) => {
      this.ready = null; // retry on the next call
      throw error;
    });
    return this.ready;
  }

  async createSession(session: NewSession): Promise<void> {
    const { sessions } = await this.collections();
    try {
      await sessions.insertOne({
        _id: session.id,
        userId: session.userId,
        language: session.language,
        startedAt: session.startedAt,
        lastEventAt: session.startedAt,
        eventCount: 0,
        turnCount: 0,
        toolCallCount: 0,
        navigationCount: 0,
        errorCount: 0,
        nextSeq: 0,
      });
    } catch (error) {
      if (isDuplicateKey(error)) throw new SpeeqError("CONFLICT", { message: "Session exists." });
      throw error;
    }
  }

  async appendEvents(
    sessionId: string,
    events: NewConversationEvent[],
  ): Promise<ConversationEvent[]> {
    if (events.length === 0) return [];
    const { sessions, events: eventsCol } = await this.collections();
    const keys = events.map((e) => e.dedupeKey).filter((k): k is string => k !== undefined);
    if (new Set(keys).size !== keys.length) throw new SpeeqError("CONFLICT");
    if (
      keys.length > 0 &&
      (await eventsCol.countDocuments({ sessionId, dedupeKey: { $in: keys } }, { limit: 1 })) > 0
    ) {
      throw new SpeeqError("CONFLICT");
    }

    // Reserve a block of sequence numbers atomically.
    const before = await sessions.findOneAndUpdate(
      { _id: sessionId },
      { $inc: { nextSeq: events.length } },
      { returnDocument: "before", projection: { nextSeq: 1 } },
    );
    if (!before) throw new SpeeqError("NOT_FOUND", { message: "Session not found." });
    const stored = events.map((e, i) => ({ ...e, seq: before.nextSeq + i }) as ConversationEvent);
    const docs = stored.map(({ id, ...rest }) => ({ _id: id, ...rest }) as EventDoc);

    try {
      await eventsCol.insertMany(docs, { ordered: true });
    } catch (error) {
      // Undo a partial batch so the call is all-or-nothing, then report the conflict.
      await eventsCol.deleteMany({ _id: { $in: docs.map((d) => d._id) } });
      if (isDuplicateKey(error)) throw new SpeeqError("CONFLICT");
      throw error;
    }

    const lastEventAt = stored.reduce((max, e) => (e.ts.localeCompare(max) > 0 ? e.ts : max), "");
    await sessions.updateOne(
      { _id: sessionId },
      { $inc: counterDelta(events), $max: { lastEventAt } },
    );
    const firstUser = stored.find((e) => e.type === "user.message");
    if (firstUser?.type === "user.message") {
      await sessions.updateOne(
        { _id: sessionId, preview: { $exists: false } },
        { $set: { preview: firstUser.data.text.slice(0, 140) } },
      );
    }
    return stored;
  }

  async listEvents(
    sessionId: string,
    options: ListEventsOptions = {},
  ): Promise<ConversationEvent[]> {
    const { events } = await this.collections();
    const filter: Filter<EventDoc> = { sessionId };
    if (options.afterSeq !== undefined) filter.seq = { $gt: options.afterSeq };
    const last = options.last === true && options.limit !== undefined;
    let cursor = events.find(filter).sort({ seq: last ? -1 : 1 });
    if (options.limit !== undefined) cursor = cursor.limit(options.limit);
    const docs = await cursor.toArray();
    return (last ? docs.reverse() : docs).map(toEvent);
  }

  async listSessions(filter: SessionFilter, cursor?: string | null): Promise<SessionPage> {
    const { sessions } = await this.collections();
    const limit = filter.limit ?? 20;
    const and: Filter<SessionDoc>[] = [];
    if (filter.userId !== undefined) and.push({ userId: filter.userId });
    if (filter.from !== undefined) and.push({ startedAt: { $gte: filter.from } });
    if (filter.to !== undefined) and.push({ startedAt: { $lte: filter.to } });
    const after = cursor ? decodeCursor(cursor) : null;
    if (after) {
      and.push({
        $or: [
          { startedAt: { $lt: after.startedAt } },
          { startedAt: after.startedAt, _id: { $lt: after.id } },
        ],
      });
    }
    const docs = await sessions
      .find(and.length > 0 ? { $and: and } : {})
      .sort({ startedAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
    const page = docs.slice(0, limit).map(toSummary);
    const last = page.at(-1);
    return {
      sessions: page,
      nextCursor: docs.length > limit && last ? encodeCursor(last.startedAt, last.id) : null,
    };
  }

  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    const { sessions } = await this.collections();
    const doc = await sessions.findOne({ _id: sessionId });
    return doc ? toSummary(doc) : null;
  }

  async deleteOlderThan(date: Date): Promise<RetentionResult> {
    const { sessions, events } = await this.collections();
    const cutoff = date.toISOString();
    const result: RetentionResult = { sessions: 0, events: 0 };
    for (;;) {
      const batch = await sessions
        .find({ lastEventAt: { $lt: cutoff } }, { projection: { _id: 1 } })
        .limit(500)
        .toArray();
      if (batch.length === 0) return result;
      const ids = batch.map((d) => d._id);
      result.events += (await events.deleteMany({ sessionId: { $in: ids } })).deletedCount;
      result.sessions += (await sessions.deleteMany({ _id: { $in: ids } })).deletedCount;
    }
  }
}

/**
 * Creates a MongoDB store from your existing connection.
 *
 * @example
 * import clientPromise from "@/lib/mongodb"; // your app's cached MongoClient
 * const store = createMongoStore({ db: async () => (await clientPromise).db() });
 */
export function createMongoStore(options: MongoStoreOptions): MongoStore {
  return new MongoStore(options);
}

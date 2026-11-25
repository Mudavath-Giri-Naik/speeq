import type { ConversationStore } from "speeq/core";
import { SpeeqError } from "speeq/core";
import { createMemoryStore } from "speeq/store-memory";

function isNotFound(error: unknown): boolean {
  return error instanceof SpeeqError && error.code === "NOT_FOUND";
}

/**
 * A memory store that never fails when a request lands on a server instance that has not seen
 * the session before. This site runs on serverless functions, where each instance has its own
 * memory. In that case the conversation simply continues without the older messages.
 */
export function createResilientStore(): ConversationStore {
  const inner = createMemoryStore({ quiet: true });
  return {
    kind: "memory",
    createSession: (session) => inner.createSession(session),
    async appendEvents(sessionId, events) {
      try {
        return await inner.appendEvents(sessionId, events);
      } catch (error) {
        if (!isNotFound(error)) throw error;
        await inner
          .createSession({
            id: sessionId,
            userId: null,
            language: "en-US",
            startedAt: new Date().toISOString(),
          })
          .catch(() => undefined);
        return inner.appendEvents(sessionId, events);
      }
    },
    listEvents: (sessionId, options) => inner.listEvents(sessionId, options),
    listSessions: (filter, cursor) => inner.listSessions(filter, cursor),
    getSessionSummary: (sessionId) => inner.getSessionSummary(sessionId),
    deleteOlderThan: (date) => inner.deleteOlderThan(date),
  };
}

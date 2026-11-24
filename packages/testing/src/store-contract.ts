import { type ConversationStore, isSpeeqError, type NewConversationEvent } from "@speeq/core";
import { beforeEach, describe, expect, it } from "vitest";

const iso = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString();

function userMessage(sessionId: string, i: number, extra: Partial<NewConversationEvent> = {}) {
  return {
    id: `evt_${sessionId}_${i}`,
    sessionId,
    ts: iso(i * 1000),
    userId: "u1",
    turnId: `t${i}`,
    type: "user.message",
    data: { text: `hello ${i}`, language: "en-IN" },
    ...extra,
  } as NewConversationEvent;
}

/**
 * The behavior every {@link ConversationStore} must have. Call it from a store adapter's tests:
 *
 * ```ts
 * import { runConversationStoreContract } from "@speeq/testing/store-contract";
 * runConversationStoreContract("memory", async () => createMemoryStore());
 * ```
 *
 * `makeStore` must return a fresh, empty store each time.
 */
export function runConversationStoreContract(
  name: string,
  makeStore: () => Promise<ConversationStore>,
): void {
  describe(`ConversationStore contract: ${name}`, () => {
    let store: ConversationStore;
    beforeEach(async () => {
      store = await makeStore();
    });

    const session = (id: string, startedAtMs: number, userId: string | null = "u1") =>
      store.createSession({ id, userId, language: "en-IN", startedAt: iso(startedAtMs) });

    it("assigns increasing seq numbers and lists events in order", async () => {
      await session("s1", 0);
      const a = await store.appendEvents("s1", [userMessage("s1", 1), userMessage("s1", 2)]);
      const b = await store.appendEvents("s1", [userMessage("s1", 3)]);
      expect(a.map((e) => e.seq)).toEqual([0, 1]);
      expect(b.map((e) => e.seq)).toEqual([2]);
      const listed = await store.listEvents("s1");
      expect(listed.map((e) => e.id)).toEqual(["evt_s1_1", "evt_s1_2", "evt_s1_3"]);
    });

    it("supports afterSeq, limit and last", async () => {
      await session("s1", 0);
      await store.appendEvents(
        "s1",
        [1, 2, 3, 4].map((i) => userMessage("s1", i)),
      );
      expect((await store.listEvents("s1", { afterSeq: 1 })).map((e) => e.seq)).toEqual([2, 3]);
      expect((await store.listEvents("s1", { limit: 2 })).map((e) => e.seq)).toEqual([0, 1]);
      expect((await store.listEvents("s1", { limit: 2, last: true })).map((e) => e.seq)).toEqual([
        2, 3,
      ]);
    });

    it("rejects duplicate dedupe keys atomically", async () => {
      await session("s1", 0);
      await store.appendEvents("s1", [userMessage("s1", 1, { dedupeKey: "k" })]);
      let error: unknown;
      try {
        await store.appendEvents("s1", [
          userMessage("s1", 2),
          userMessage("s1", 3, { dedupeKey: "k" }),
        ]);
      } catch (e) {
        error = e;
      }
      expect(isSpeeqError(error) && error.code).toBe("CONFLICT");
      expect(await store.listEvents("s1")).toHaveLength(1);
    });

    it("keeps dedupe keys per session", async () => {
      await session("s1", 0);
      await session("s2", 1);
      await store.appendEvents("s1", [userMessage("s1", 1, { dedupeKey: "k" })]);
      await expect(
        store.appendEvents("s2", [userMessage("s2", 1, { dedupeKey: "k" })]),
      ).resolves.toHaveLength(1);
    });

    it("summarizes sessions", async () => {
      await session("s1", 0);
      await store.appendEvents("s1", [
        userMessage("s1", 1),
        {
          id: "n",
          sessionId: "s1",
          ts: iso(5000),
          userId: "u1",
          type: "navigation",
          data: { routeId: "a", href: "/a", params: {} },
        },
        {
          id: "e",
          sessionId: "s1",
          ts: iso(6000),
          userId: "u1",
          type: "error",
          data: { code: "RATE_LIMITED", message: "x" },
        },
      ]);
      const s = await store.getSessionSummary("s1");
      expect(s).toMatchObject({
        id: "s1",
        eventCount: 3,
        turnCount: 1,
        navigationCount: 1,
        errorCount: 1,
        preview: "hello 1",
        lastEventAt: iso(6000),
      });
      expect(await store.getSessionSummary("missing")).toBeNull();
    });

    it("lists sessions newest first with cursor paging and filters", async () => {
      for (let i = 0; i < 5; i++) await session(`s${i}`, i * 60_000, i % 2 === 0 ? "u1" : "u2");
      const p1 = await store.listSessions({ limit: 2 });
      expect(p1.sessions.map((s) => s.id)).toEqual(["s4", "s3"]);
      const p2 = await store.listSessions({ limit: 2 }, p1.nextCursor);
      expect(p2.sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
      const p3 = await store.listSessions({ limit: 2 }, p2.nextCursor);
      expect(p3.sessions.map((s) => s.id)).toEqual(["s0"]);
      expect(p3.nextCursor).toBeNull();
      const u2 = await store.listSessions({ userId: "u2" });
      expect(u2.sessions.map((s) => s.id)).toEqual(["s3", "s1"]);
      const ranged = await store.listSessions({ from: iso(60_000), to: iso(180_000) });
      expect(ranged.sessions.map((s) => s.id)).toEqual(["s3", "s2", "s1"]);
    });

    it("deletes sessions older than a date with their events", async () => {
      await session("old", 0);
      await store.appendEvents("old", [userMessage("old", 1)]);
      await session("new", 10 * 86_400_000);
      await store.appendEvents("new", [userMessage("new", 10 * 86_400)]);
      const result = await store.deleteOlderThan(new Date(Date.UTC(2026, 0, 5)));
      expect(result).toEqual({ sessions: 1, events: 1 });
      expect(await store.getSessionSummary("old")).toBeNull();
      expect(await store.listEvents("old")).toEqual([]);
      expect(await store.getSessionSummary("new")).not.toBeNull();
    });

    it("rejects appends to unknown sessions", async () => {
      let error: unknown;
      try {
        await store.appendEvents("nope", [userMessage("nope", 1)]);
      } catch (e) {
        error = e;
      }
      expect(isSpeeqError(error) && error.code).toBe("NOT_FOUND");
    });
  });
}

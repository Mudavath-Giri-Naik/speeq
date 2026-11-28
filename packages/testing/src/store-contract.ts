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

    it("stores the tenant, filters by it and reads sessions without one as null", async () => {
      const base = { userId: "u1", language: "en-IN" } as const;
      await store.createSession({ ...base, id: "t1", tenantId: "acme", startedAt: iso(0) });
      await store.createSession({ ...base, id: "t2", tenantId: "globex", startedAt: iso(60_000) });
      // A record written by 0.11 has no tenantId at all.
      await store.createSession({ ...base, id: "t3", startedAt: iso(120_000) });
      expect((await store.getSessionSummary("t1"))?.tenantId).toBe("acme");
      expect((await store.getSessionSummary("t3"))?.tenantId).toBeNull();
      const acme = await store.listSessions({ userId: "u1", tenantId: "acme" });
      expect(acme.sessions.map((s) => s.id)).toEqual(["t1"]);
      const all = await store.listSessions({ userId: "u1" });
      expect(all.sessions.map((s) => s.id)).toEqual(["t3", "t2", "t1"]);
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

    // Memory methods (0.12+) are optional; stores that implement them must pass these.
    const future = () => new Date(Date.now() + 86_400_000).toISOString();
    const A = { userId: "u1", tenantId: null };
    const A2 = { userId: "u1", tenantId: "acme" };
    const B = { userId: "u2", tenantId: null };

    it("keeps preferences per user and tenant, one per category", async () => {
      if (!store.setPreference || !store.getPreferences) return;
      await store.setPreference(A, "language", "Telugu", future());
      await store.setPreference(A, "language", "Hindi", future());
      await store.setPreference(A, "subject", "DBMS", future());
      await store.setPreference(A2, "subject", "OS", future());
      await store.setPreference(B, "subject", "Networks", future());
      const a = await store.getPreferences(A);
      expect(a.map((p) => [p.category, p.value]).sort()).toEqual([
        ["language", "Hindi"],
        ["subject", "DBMS"],
      ]);
      expect((await store.getPreferences(A2)).map((p) => p.value)).toEqual(["OS"]);
      expect((await store.getPreferences(B)).map((p) => p.value)).toEqual(["Networks"]);
      expect(await store.getPreferences({ userId: "nobody", tenantId: null })).toEqual([]);
    });

    it("ignores expired preferences", async () => {
      if (!store.setPreference || !store.getPreferences) return;
      await store.setPreference(A, "language", "Tamil", new Date(Date.now() - 1000).toISOString());
      await store.setPreference(A, "subject", "DBMS", future());
      expect((await store.getPreferences(A)).map((p) => p.category)).toEqual(["subject"]);
    });

    it("forgets a scope's sessions but keeps their events, and leaves other scopes alone", async () => {
      if (!store.clearScope) return;
      const base = { language: "en-IN" } as const;
      await store.createSession({
        ...base,
        id: "a",
        userId: "u1",
        tenantId: null,
        startedAt: iso(0),
      });
      await store.createSession({ ...base, id: "legacy", userId: "u1", startedAt: iso(1000) });
      await store.createSession({
        ...base,
        id: "t",
        userId: "u1",
        tenantId: "acme",
        startedAt: iso(2000),
      });
      await store.createSession({
        ...base,
        id: "b",
        userId: "u2",
        tenantId: null,
        startedAt: iso(3000),
      });
      await store.appendEvents("a", [userMessage("a", 1)]);
      await store.setPreference?.(A, "language", "Telugu", future());
      await store.setPreference?.(A2, "language", "Hindi", future());
      const result = await store.clearScope(A, { conversations: "forget", preferences: true });
      expect(result.sessions).toBe(2);
      expect((await store.getSessionSummary("a"))?.forgottenAt).toEqual(expect.any(String));
      expect((await store.getSessionSummary("legacy"))?.forgottenAt).toEqual(expect.any(String));
      expect((await store.getSessionSummary("t"))?.forgottenAt).toBeUndefined();
      expect((await store.getSessionSummary("b"))?.forgottenAt).toBeUndefined();
      expect(await store.listEvents("a")).toHaveLength(1);
      if (store.getPreferences) {
        expect(result.preferences).toBe(1);
        expect(await store.getPreferences(A)).toEqual([]);
        expect(await store.getPreferences(A2)).toHaveLength(1);
      }
      // Forgetting again changes nothing.
      expect(
        (await store.clearScope(A, { conversations: "forget", preferences: false })).sessions,
      ).toBe(0);
    });

    it("deletes a scope's sessions with their events", async () => {
      if (!store.clearScope) return;
      await session("a", 0, "u1");
      await session("b", 1000, "u2");
      await store.appendEvents("a", [userMessage("a", 1)]);
      await store.appendEvents("b", [userMessage("b", 1)]);
      const result = await store.clearScope(A, { conversations: "delete", preferences: false });
      expect(result.sessions).toBe(1);
      expect(await store.getSessionSummary("a")).toBeNull();
      expect(await store.listEvents("a")).toEqual([]);
      expect(await store.listEvents("b")).toHaveLength(1);
    });

    it("keeps preferences when only conversations are cleared", async () => {
      if (!store.clearScope || !store.setPreference || !store.getPreferences) return;
      await store.setPreference(A, "language", "Telugu", future());
      await store.clearScope(A, { conversations: "forget", preferences: false });
      expect(await store.getPreferences(A)).toHaveLength(1);
    });
  });
}

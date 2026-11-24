import { runConversationStoreContract } from "@speeq/testing/store-contract";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMongoStore } from "../src/index.js";

let server: MongoMemoryServer;
let client: MongoClient;
let dbCounter = 0;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = await MongoClient.connect(server.getUri());
}, 240_000);

afterAll(async () => {
  await client?.close();
  await server?.stop();
});

const freshDb = () => client.db(`speeq_test_${++dbCounter}`);

runConversationStoreContract("mongodb", async () => createMongoStore({ db: freshDb() }));

describe("MongoStore", () => {
  it("accepts a lazy Db factory and creates its indexes", async () => {
    const db = freshDb();
    const store = createMongoStore({ db: async () => db, collectionPrefix: "x_" });
    await store.createSession({
      id: "s",
      userId: null,
      language: "en-IN",
      startedAt: new Date().toISOString(),
    });
    const names = (await db.collection("x_events").indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["session_seq", "session_dedupe", "ts"]));
  });

  it("keeps seq unique under concurrent appends", async () => {
    const store = createMongoStore({ db: freshDb() });
    await store.createSession({
      id: "s",
      userId: "u",
      language: "en-IN",
      startedAt: new Date().toISOString(),
    });
    const ev = (i: number) => ({
      id: `e${i}`,
      sessionId: "s",
      ts: new Date().toISOString(),
      userId: "u",
      type: "error" as const,
      data: { code: "INTERNAL" as const, message: String(i) },
    });
    await Promise.all(Array.from({ length: 10 }, (_, i) => store.appendEvents("s", [ev(i)])));
    const seqs = (await store.listEvents("s")).map((e) => e.seq);
    expect(new Set(seqs).size).toBe(10);
    expect((await store.getSessionSummary("s"))?.errorCount).toBe(10);
  });

  it("lets only one of two racing confirmations win", async () => {
    const store = createMongoStore({ db: freshDb() });
    await store.createSession({
      id: "s",
      userId: "u",
      language: "en-IN",
      startedAt: new Date().toISOString(),
    });
    const resolve = (id: string) =>
      store.appendEvents("s", [
        {
          id,
          sessionId: "s",
          ts: new Date().toISOString(),
          userId: "u",
          dedupeKey: "confirmation:c1",
          type: "confirmation.resolved",
          data: { confirmationId: "c1", approved: true, userId: "u" },
        },
      ]);
    const results = await Promise.allSettled([resolve("a"), resolve("b"), resolve("c")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason.code),
    ).toEqual(["CONFLICT", "CONFLICT"]);
  });
});

import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, expect, it } from "vitest";
import { liveStoreCheck, type Setup } from "../src/index.js";

let server: MongoMemoryServer;
let client: MongoClient;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = await MongoClient.connect(server.getUri());
}, 240_000);
afterAll(async () => {
  await client?.close();
  await server?.stop();
});

it("proves persistence in MongoDB and leaves no test collections behind", async () => {
  const db = client.db("shop");
  await db.collection("orders").insertOne({ _id: "keep" as never, total: 1 });
  const setup: Setup = {
    setupVersion: 2,
    provider: "mock",
    voice: "none",
    languages: ["en-IN"],
    ui: false,
    env: true,
    memory: { mode: "persistent" },
  };
  const r = await liveStoreCheck(setup, db);
  expect(r).toMatchObject({ id: "L1", status: "pass" });
  const names = (await db.listCollections().toArray()).map((c) => c.name);
  expect(names).toEqual(["orders"]);
  expect(await db.collection("orders").countDocuments()).toBe(1);
}, 60_000);

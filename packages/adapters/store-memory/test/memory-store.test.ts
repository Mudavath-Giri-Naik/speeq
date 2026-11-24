import { runConversationStoreContract } from "@speeq/testing/store-contract";
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../src/index.js";

runConversationStoreContract("memory", async () => createMemoryStore({ quiet: true }));

describe("MemoryStore", () => {
  it("returns copies, not internal references", async () => {
    const store = createMemoryStore({ quiet: true });
    await store.createSession({
      id: "s",
      userId: null,
      language: "en-IN",
      startedAt: new Date().toISOString(),
    });
    await store.appendEvents("s", [
      {
        id: "e",
        sessionId: "s",
        ts: new Date().toISOString(),
        userId: null,
        type: "error",
        data: { code: "INTERNAL", message: "x" },
      },
    ]);
    const [first] = await store.listEvents("s");
    if (first?.type === "error") first.data.message = "mutated";
    const [again] = await store.listEvents("s");
    expect(again?.type === "error" && again.data.message).toBe("x");
  });
});

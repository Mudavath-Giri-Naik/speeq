import { SpeeqError } from "@speeq/core/errors";
import { createSpeeq, defineTool } from "@speeq/server";
import { createMemoryStore } from "@speeq/store-memory";
import { FakeLLMProvider, type FakeScript } from "@speeq/testing";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createSpeeqClient } from "../src/index.js";

function setup(script: FakeScript) {
  const write = vi.fn(() => ({ saved: true }));
  const speeq = createSpeeq({
    secret: "in-memory-client-integration-test-secret",
    agent: { name: "Helper", instructions: "Help the user." },
    llm: new FakeLLMProvider(script),
    store: createMemoryStore({ quiet: true }),
    telemetry: { enabled: false },
    tools: [
      defineTool({
        name: "save",
        description: "Save a note",
        risk: "write",
        input: z.object({ note: z.string() }),
        handler: write,
      }),
    ],
  });
  return {
    write,
    client: createSpeeqClient({
      endpoint: "/api/speeq",
      fetch: (url, init) =>
        speeq.handler(new Request(new URL(String(url), "http://localhost"), init)),
    }),
  };
}
it("executes a write once after approval and reports replay and missing confirmations", async () => {
  const { client, write } = setup([
    { toolCalls: [{ name: "save", arguments: { note: "hello" } }] },
    { text: "Saved." },
  ]);
  await client.sendText("save hello");
  const pending = client.getSnapshot().pendingConfirmation;
  expect(pending).toMatchObject({ toolName: "save", args: { note: "hello" } });
  expect(write).not.toHaveBeenCalled();
  if (!pending) throw Error("Missing confirmation");
  const followup = client.confirm(pending.confirmationId, true);
  expect(client.getSnapshot()).toMatchObject({ state: "thinking", pendingConfirmation: null });
  await followup;
  expect(client.getSnapshot().messages.at(-1)).toMatchObject({
    role: "assistant",
    text: "Saved.",
    status: "done",
  });
  await client.confirm(pending.confirmationId, true);
  expect(client.getSnapshot()).toMatchObject({ state: "error", error: { code: "CONFLICT" } });
  expect(write).toHaveBeenCalledTimes(1);
  await client.confirm("missing", false);
  expect(client.getSnapshot()).toMatchObject({ state: "error", error: { code: "NOT_FOUND" } });
});
it("preserves the server's retry delay and marks a partial reply as failed", async () => {
  const { client } = setup([
    { text: "Partial", error: new SpeeqError("RATE_LIMITED", { retryAfterMs: 2300 }) },
  ]);
  await client.sendText("go");
  expect(client.getSnapshot()).toMatchObject({
    state: "error",
    error: { code: "RATE_LIMITED", retryAfterMs: 2300, retryable: true },
  });
  expect(client.getSnapshot().messages.at(-1)).toMatchObject({
    role: "assistant",
    text: "Partial",
    status: "error",
  });
});

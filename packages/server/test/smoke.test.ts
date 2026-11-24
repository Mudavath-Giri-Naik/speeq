import { createMemoryStore } from "@speeq/store-memory";
import { FakeLLMProvider, jsonRequest, startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createSpeeq, defineRoute, defineTool } from "../src/index.js";

const SECRET = "test-secret-test-secret-test-secret-1234";

function setup(llm: FakeLLMProvider) {
  return createSpeeq({
    secret: SECRET,
    agent: { name: "Helper", instructions: "Help the user." },
    llm,
    store: createMemoryStore({ quiet: true }),
    routes: [defineRoute({ id: "pricing", path: "/pricing", title: "Pricing" })],
    tools: [
      defineTool({
        name: "count_questions",
        description: "Count questions",
        input: z.object({ subject: z.string() }),
        handler: ({ subject }) => ({ subject, count: 12 }),
      }),
    ],
  });
}

describe("server smoke test", () => {
  it("answers health checks", async () => {
    const speeq = setup(new FakeLLMProvider([]));
    const res = await speeq.handler(jsonRequest("/api/speeq/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, protocolVersion: 1 });
  });

  it("navigates via the built-in tool and finishes the turn", async () => {
    const llm = new FakeLLMProvider([
      { toolCalls: [{ name: "navigate", arguments: { routeId: "pricing" } }] },
      { text: "Opening pricing." },
    ]);
    const session = await startSession(setup(llm).handler);
    const events = await session.turn("take me to pricing");
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("turn.started");
    expect(types.at(-1)).toBe("turn.finished");
    expect(events.find((e) => e.type === "navigate")).toMatchObject({ href: "/pricing" });
  });

  it("runs a custom tool and feeds the result back to the model", async () => {
    const llm = new FakeLLMProvider([
      { toolCalls: [{ name: "count_questions", arguments: { subject: "physics" } }] },
      { text: "There are 12 questions." },
    ]);
    const session = await startSession(setup(llm).handler);
    const events = await session.turn("how many physics questions?");
    expect(events.find((e) => e.type === "tool.finished")).toMatchObject({ ok: true });
    const toolMsg = llm.requests[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg?.role === "tool" && toolMsg.content).toContain('"count":12');
  });
});

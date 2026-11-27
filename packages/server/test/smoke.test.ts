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

  it("skips the second model call when the reply that opened the page already said something", async () => {
    const llm = new FakeLLMProvider([
      {
        text: "Sure, taking you to pricing.",
        toolCalls: [{ name: "navigate", arguments: { routeId: "pricing" } }],
      },
      { text: "this should never be asked for" },
    ]);
    const session = await startSession(setup(llm).handler);
    const events = await session.turn("take me to pricing");
    expect(llm.requests).toHaveLength(1);
    expect(events.find((e) => e.type === "navigate")).toMatchObject({ href: "/pricing" });
    expect(events.filter((e) => e.type === "assistant.message")).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "turn.finished", reason: "completed" });
    // the next turn still sees the whole exchange
    const next = await session.turn("what did I just ask?");
    expect(next.at(-1)?.type).toBe("turn.finished");
    const roles = llm.requests[1]?.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "tool", "user"]);
  });

  it("still asks the model for a reply after a silent page change, and after a failed one", async () => {
    const silent = new FakeLLMProvider([
      { toolCalls: [{ name: "navigate", arguments: { routeId: "pricing" } }] },
      { text: "Here you go." },
    ]);
    await (await startSession(setup(silent).handler)).turn("pricing please");
    expect(silent.requests).toHaveLength(2);
    const failed = new FakeLLMProvider([
      { text: "On it.", toolCalls: [{ name: "navigate", arguments: { routeId: "nope" } }] },
      { text: "Sorry, I could not find that page." },
    ]);
    await (await startSession(setup(failed).handler)).turn("open nope");
    expect(failed.requests).toHaveLength(2);
  });

  it("the system prompt asks for a natural human tone and one short line with the page change", async () => {
    const llm = new FakeLLMProvider([{ text: "Hi." }]);
    await (await startSession(setup(llm).handler)).turn("hello");
    const system = llm.requests[0]?.messages[0];
    const content = system?.role === "system" ? system.content : "";
    expect(content).toContain("not a bot or a help-desk script");
    expect(content).toContain("in that same reply, once");
    expect(content).toContain("not like a translation");
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

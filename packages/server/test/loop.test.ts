import { SpeeqError } from "@speeq/core";
import { assistantText, jsonRequest, startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../src/index.js";
import { makeSpeeq } from "./helpers.js";

const slowTool = defineTool({
  name: "slow",
  description: "Never finishes in time",
  input: z.object({}),
  timeoutMs: 30,
  handler: () => new Promise(() => undefined),
});
const bigTool = defineTool({
  name: "big",
  description: "Returns a lot",
  input: z.object({}),
  handler: () => ({ data: "x".repeat(50_000) }),
});
const forbiddenTool = defineTool({
  name: "secret_stats",
  description: "Admins only",
  input: z.object({}),
  handler: () => {
    throw new SpeeqError("FORBIDDEN", { message: "Only admins can see stats." });
  },
});
const crashingTool = defineTool({
  name: "crash",
  description: "Throws a raw error",
  input: z.object({}),
  handler: () => {
    throw new Error("connection string mongodb://user:hunter2@db");
  },
});
const extraTools = { tools: [slowTool, bigTool, forbiddenTool, crashingTool] };

function toolResult(llm: ReturnType<typeof makeSpeeq>["llm"], call = 1): string {
  const msg = llm.requests[call]?.messages.findLast((m) => m.role === "tool");
  return msg?.role === "tool" ? msg.content : "";
}

describe("agent loop", () => {
  it("streams text deltas and a final message for a plain answer", async () => {
    const { speeq } = makeSpeeq([
      { text: "Hello there. How can I help?", usage: { totalTokens: 9 } },
    ]);
    const events = await (await startSession(speeq.handler)).turn("hi");
    expect(events.filter((e) => e.type === "assistant.delta").length).toBeGreaterThan(1);
    expect(assistantText(events)).toBe("Hello there. How can I help?");
    expect(events.at(-1)).toMatchObject({
      type: "turn.finished",
      reason: "completed",
      usage: { totalTokens: 9 },
    });
  });

  it("runs several tool steps before answering", async () => {
    const { speeq, llm } = makeSpeeq([
      { toolCalls: [{ name: "count_questions", arguments: { subject: "physics" } }] },
      { toolCalls: [{ name: "search_knowledge", arguments: { query: "refunds" } }] },
      { text: "Done." },
    ]);
    const events = await (await startSession(speeq.handler)).turn("go");
    expect(
      events
        .filter((e) => e.type === "tool.finished")
        .map((e) => e.type === "tool.finished" && e.ok),
    ).toEqual([true, true]);
    expect(llm.callCount).toBe(3);
    expect(toolResult(llm, 2)).toContain("Refund policy");
  });

  it("stops at maxSteps and gives the last step no tools", async () => {
    const loopForever = () => ({
      toolCalls: [{ name: "count_questions", arguments: { subject: "x" } }],
    });
    const { speeq, llm } = makeSpeeq(loopForever, {
      agent: { name: "H", instructions: "", maxSteps: 3 },
    });
    const events = await (await startSession(speeq.handler)).turn("go");
    expect(llm.callCount).toBe(3);
    expect(llm.requests[2]?.tools).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "turn.finished", reason: "max_steps" });
    expect(assistantText(events)).toMatch(/step limit/);
  });

  it("sends validation errors back to the model instead of running the tool", async () => {
    const { speeq, llm } = makeSpeeq([
      { toolCalls: [{ name: "count_questions", arguments: { subject: 42 } }] },
      { text: "Sorry." },
    ]);
    const events = await (await startSession(speeq.handler)).turn("go");
    expect(events.find((e) => e.type === "tool.finished")).toMatchObject({
      ok: false,
      errorCode: "INVALID_INPUT",
    });
    expect(toolResult(llm)).toContain("Invalid arguments");
  });

  it("times out slow tools", async () => {
    const { speeq, llm } = makeSpeeq(
      [{ toolCalls: [{ name: "slow", arguments: {} }] }, { text: "Too slow." }],
      extraTools,
    );
    const events = await (await startSession(speeq.handler)).turn("go");
    expect(events.find((e) => e.type === "tool.finished")).toMatchObject({
      ok: false,
      errorCode: "TOOL_TIMEOUT",
    });
    expect(toolResult(llm)).toContain("TOOL_TIMEOUT");
  });

  it("truncates large tool output", async () => {
    const { speeq, llm } = makeSpeeq(
      [{ toolCalls: [{ name: "big", arguments: {} }] }, { text: "ok" }],
      {
        ...extraTools,
        guardrails: { maxToolOutputChars: 500 },
      },
    );
    await (await startSession(speeq.handler)).turn("go");
    expect(toolResult(llm).length).toBeLessThanOrEqual(500);
    expect(toolResult(llm)).toContain("[truncated]");
  });

  it("passes SpeeqError messages to the model but hides raw errors", async () => {
    const { speeq, llm } = makeSpeeq(
      [
        {
          toolCalls: [
            { name: "secret_stats", arguments: {} },
            { name: "crash", arguments: {} },
          ],
        },
        { text: "ok" },
      ],
      extraTools,
    );
    const events = await (await startSession(speeq.handler)).turn("go");
    const result = toolResult(llm);
    expect(
      llm.requests[1]?.messages.some((m) => m.role === "tool" && m.content.includes("Only admins")),
    ).toBe(true);
    expect(result).toContain("TOOL_ERROR");
    expect(JSON.stringify(events)).not.toContain("hunter2");
    expect(JSON.stringify(llm.requests)).not.toContain("hunter2");
  });

  it("maps provider errors to an error event and still finishes the turn", async () => {
    const { speeq } = makeSpeeq([{ text: "Partial ", error: new Error("socket hang up") }]);
    const events = await (await startSession(speeq.handler)).turn("go");
    expect(events.find((e) => e.type === "error")).toMatchObject({
      code: "PROVIDER_ERROR",
      retryable: true,
    });
    expect(events.at(-1)).toMatchObject({ type: "turn.finished", reason: "error" });
    expect(JSON.stringify(events)).not.toContain("socket hang up");
  });

  it("passes RATE_LIMITED through with a retry hint", async () => {
    const { speeq } = makeSpeeq([
      { error: new SpeeqError("RATE_LIMITED", { retryAfterMs: 3000 }) },
    ]);
    const events = await (await startSession(speeq.handler)).turn("go");
    expect(events.find((e) => e.type === "error")).toMatchObject({
      code: "RATE_LIMITED",
      retryAfterMs: 3000,
    });
    expect(events.at(-1)?.type).toBe("turn.finished");
  });

  it("puts the language, routes and safety rules in the system prompt", async () => {
    const { speeq, llm } = makeSpeeq([{ text: "నమస్కారం" }]);
    await (await startSession(speeq.handler, { language: "te-IN" })).turn("hi", {
      language: "te-IN",
      context: { path: "/practice", title: "Practice" },
    });
    const system = llm.requests[0]?.messages[0];
    expect(system?.role).toBe("system");
    const text = system?.role === "system" ? system.content : "";
    expect(text).toContain("Telugu (te-IN)");
    expect(text).toContain('- pricing: "Pricing"');
    expect(text).toContain("untrusted DATA");
    expect(text).toContain('"path":"/practice"');
  });

  it("sends earlier turns as history", async () => {
    const { speeq, llm } = makeSpeeq([{ text: "First." }, { text: "Second." }]);
    const s = await startSession(speeq.handler);
    await s.turn("one");
    await s.turn("two");
    const roles = llm.requests[1]?.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
  });

  it("rejects languages that are not enabled", async () => {
    const { speeq } = makeSpeeq([]);
    const s = await startSession(speeq.handler);
    const res = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/turn`, {
        body: { text: "hi", language: "fr-FR" },
        token: s.token,
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });
});

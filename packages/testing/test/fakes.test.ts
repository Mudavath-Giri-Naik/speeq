import { describe, expect, it } from "vitest";
import {
  createMockLLMProvider,
  FakeLLMProvider,
  FakeSpeechInput,
  FakeSpeechOutput,
} from "../src/index.js";

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe("FakeLLMProvider", () => {
  it("replays scripted text and tool calls and records requests", async () => {
    const llm = new FakeLLMProvider([
      { text: "Hello there", usage: { totalTokens: 3 } },
      { toolCalls: [{ id: "c1", name: "navigate", arguments: { routeId: "x" } }] },
    ]);
    const a = await collect(llm.stream({ messages: [{ role: "user", content: "hi" }], tools: [] }));
    expect(
      a
        .filter((c) => c.type === "text-delta")
        .map((c) => (c.type === "text-delta" ? c.text : ""))
        .join(""),
    ).toBe("Hello there");
    expect(a.at(-1)).toEqual({ type: "finish", reason: "stop", usage: { totalTokens: 3 } });
    const b = await collect(llm.stream({ messages: [], tools: [] }));
    expect(b[0]).toEqual({
      type: "tool-call",
      call: { id: "c1", name: "navigate", arguments: { routeId: "x" } },
    });
    expect(b.at(-1)).toMatchObject({ reason: "tool_calls" });
    expect(llm.callCount).toBe(2);
    expect(llm.requests[0]?.messages[0]).toEqual({ role: "user", content: "hi" });
  });

  it("throws scripted errors", async () => {
    const llm = new FakeLLMProvider([{ error: new Error("boom") }]);
    await expect(collect(llm.stream({ messages: [], tools: [] }))).rejects.toThrow("boom");
  });
});

describe("createMockLLMProvider", () => {
  const llm = createMockLLMProvider({
    rules: [
      {
        match: /pricing/,
        respond: () => ({ toolCalls: [{ name: "navigate", arguments: { routeId: "pricing" } }] }),
      },
    ],
    afterTool: ({ toolName }) => ({ text: `ran ${toolName}` }),
  });

  it("matches keyword rules", async () => {
    const chunks = await collect(
      llm.stream({ messages: [{ role: "user", content: "Take me to PRICING" }], tools: [] }),
    );
    expect(chunks[0]).toMatchObject({ type: "tool-call", call: { name: "navigate" } });
  });

  it("summarizes after tools and falls back", async () => {
    const after = await collect(
      llm.stream({
        messages: [
          { role: "user", content: "pricing" },
          {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "c", name: "navigate", arguments: {} }],
          },
          { role: "tool", toolCallId: "c", name: "navigate", content: "{}" },
        ],
        tools: [],
      }),
    );
    expect(after[0]).toEqual({ type: "text-delta", text: "ran " });
    const fb = await collect(
      llm.stream({ messages: [{ role: "user", content: "???" }], tools: [] }),
    );
    expect(fb.map((c) => (c.type === "text-delta" ? c.text : "")).join("")).toMatch(/mock mode/);
  });
});

describe("fake speech", () => {
  it("drives recognition handlers", () => {
    const input = new FakeSpeechInput();
    const seen: string[] = [];
    input.start(
      { language: "en-IN" },
      {
        onInterim: (t) => seen.push(`~${t}`),
        onFinal: (t) => seen.push(t),
        onEnd: () => seen.push("end"),
      },
    );
    expect(input.listening).toBe(true);
    input.say("hello", ["he"]);
    expect(seen).toEqual(["~he", "hello", "end"]);
    expect(input.listening).toBe(false);
  });

  it("records speech output and voices", async () => {
    const out = new FakeSpeechOutput({ voices: ["en-IN"] });
    await out.speak("Hi.", { language: "en-IN" });
    expect(out.spoken).toEqual([{ text: "Hi.", language: "en-IN" }]);
    expect(await out.hasVoiceFor("te-IN")).toBe(false);
  });
});

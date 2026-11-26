import { FakeSttProvider, jsonRequest, readSseEvents, startSession } from "@speeq/testing";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { needsClarification } from "../src/agent/voice-guard.js";
import { defineTool } from "../src/index.js";
import { makeSpeeq } from "./helpers.js";

it("evaluates only uncertain voice metadata", () => {
  for (const inputMode of ["text", "voice"] as const)
    for (const confidence of [undefined, 0.49, 0.5, 0.9])
      for (const ambiguous of [[], ["name"]])
        expect(
          needsClarification({ inputMode, transcript: { raw: "x", confidence, ambiguous } }),
        ).toBe(
          inputMode === "voice" &&
            (ambiguous.length > 0 || (confidence !== undefined && confidence < 0.5)),
        );
  expect(needsClarification({ inputMode: "voice" })).toBe(false);
  expect(
    needsClarification({ inputMode: "voice", transcript: { raw: "a", confidence: 0.7 } }, 0.8),
  ).toBe(true);
});
it("blocks even confirmation-exempt writes while allowing reads and navigation", async () => {
  const write = vi.fn(),
    read = vi.fn(() => 1);
  const { speeq, llm } = makeSpeeq(
    [
      {
        toolCalls: [
          { name: "write", arguments: {} },
          { name: "read", arguments: {} },
          { name: "navigate", arguments: { routeId: "pricing" } },
        ],
      },
      { text: "Which item?" },
    ],
    {
      tools: [
        defineTool({
          name: "write",
          description: "write",
          risk: "write",
          requiresConfirmation: false,
          input: z.object({}),
          handler: write,
        }),
        defineTool({ name: "read", description: "read", input: z.object({}), handler: read }),
      ],
    },
  );
  const session = await startSession(speeq.handler);
  const res = await speeq.handler(
    jsonRequest(`/session/${session.sessionId}/turn`, {
      headers: { authorization: `Bearer ${session.token}` },
      body: {
        language: "en-IN",
        inputLanguage: "te",
        inputMode: "voice",
        text: "update",
        transcript: { raw: "update", ambiguous: ["item"] },
      },
    }),
  );
  const events = await readSseEvents(res);
  expect(events).toContainEqual(
    expect.objectContaining({ type: "turn.started", inputLanguage: "te" }),
  );
  expect(events.some((e) => e.type === "navigate")).toBe(true);
  expect(write).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledOnce();
  expect(llm.callCount).toBe(2);
  const messages = llm.requests[1]?.messages ?? [];
  expect(
    messages.some((m) => m.role === "tool" && m.content === '{"error":"needs_clarification"}'),
  ).toBe(true);
  expect(messages[0]?.content).toContain("short confirming question");
  expect(messages[0]?.content).toContain("visitor spoke te");
  expect(messages[0]?.content).toContain("Domain terms");
});
it.each(["none", "prompt", "native"] as const)("passes only supported hints (%s)", async (mode) => {
  const fake = new FakeSttProvider(["my brand"]);
  const p = {
    ...fake,
    capabilities: { ...fake.capabilities, vocabulary: mode },
    transcribe: fake.transcribe.bind(fake),
  };
  const { speeq } = makeSpeeq([], {
    vocabulary: { terms: [{ term: "Brand", aliases: ["my brand"] }] },
    speech: { stt: [p], routing: { stt: { default: [p.id] } } },
  });
  const s = await startSession(speeq.handler);
  const response = await speeq.handler(
    new Request(`http://localhost/session/${s.sessionId}/speech/transcribe`, {
      method: "POST",
      headers: { authorization: `Bearer ${s.token}`, "content-type": "audio/ogg" },
      body: "synthetic",
    }),
  );
  expect(await response.json()).toMatchObject({ text: "Brand", raw: "my brand", corrected: true });
  expect(!!fake.requests[0]?.hints).toBe(mode !== "none");
  if (mode !== "none") expect(fake.requests[0]?.hints?.vocabulary).toContain("Pricing");
});
it("rejects invalid vocabulary and threshold at startup", () => {
  expect(() => makeSpeeq([], { speech: { clarifyBelow: 2 } })).toThrow();
  expect(() => makeSpeeq([], { vocabulary: { terms: [{ term: "" }] } })).toThrow();
});

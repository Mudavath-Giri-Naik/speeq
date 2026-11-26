import type { LLMStreamChunk } from "@speeq/core";
import { describe, expect, it } from "vitest";
import { createGeminiProvider, toGeminiContents } from "../src/index.js";

function sseResponse(payloads: unknown[], chunkSize = 9): Response {
  const text = payloads.map((p) => `data: ${JSON.stringify(p)}\r\n\r\n`).join("");
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += chunkSize) c.enqueue(bytes.slice(i, i + chunkSize));
        c.close();
      },
    }),
    { status: 200 },
  );
}

function provider(response: Response, seen: Array<{ url: string; init: RequestInit }> = []) {
  return createGeminiProvider({
    apiKey: "AIza-test",
    model: "gemini-3.8-flash",
    fetch: async (url, init) => {
      seen.push({ url: String(url), init: init ?? {} });
      return response;
    },
  });
}

async function collect(iter: AsyncIterable<LLMStreamChunk>) {
  const out: LLMStreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

describe("Gemini provider", () => {
  it("streams text, skips thoughts and reports usage", async () => {
    const chunks = await collect(
      provider(
        sseResponse([
          {
            candidates: [
              { content: { parts: [{ text: "thinking…", thought: true }, { text: "Namaste" }] } },
            ],
          },
          {
            candidates: [{ content: { parts: [{ text: "!" }] }, finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
          },
        ]),
      ).stream({ messages: [{ role: "user", content: "hi" }], tools: [] }),
    );
    expect(chunks).toEqual([
      { type: "text-delta", text: "Namaste" },
      { type: "text-delta", text: "!" },
      {
        type: "finish",
        reason: "stop",
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      },
    ]);
  });

  it("emits function calls with their id and thought signature", async () => {
    const chunks = await collect(
      provider(
        sseResponse([
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: { id: "fc1", name: "navigate", args: { routeId: "pricing" } },
                      thoughtSignature: "SIG_A",
                    },
                    {
                      functionCall: {
                        id: "fc2",
                        name: "count_questions",
                        args: { subject: "maths" },
                      },
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
          },
        ]),
      ).stream({ messages: [{ role: "user", content: "go" }], tools: [] }),
    );
    expect(chunks.slice(0, 2)).toEqual([
      {
        type: "tool-call",
        call: {
          id: "fc1",
          name: "navigate",
          arguments: { routeId: "pricing" },
          providerMetadata: { geminiCallId: "fc1", thoughtSignature: "SIG_A" },
        },
      },
      {
        type: "tool-call",
        call: {
          id: "fc2",
          name: "count_questions",
          arguments: { subject: "maths" },
          providerMetadata: { geminiCallId: "fc2" },
        },
      },
    ]);
    expect(chunks.at(-1)).toEqual({ type: "finish", reason: "tool_calls" });
  });

  it("sends system instruction, tools, signatures and merged function responses", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    await collect(
      provider(
        sseResponse([{ candidates: [{ content: { parts: [{ text: "ok" }] } }] }]),
        seen,
      ).stream({
        messages: [
          { role: "system", content: "Be brief." },
          { role: "user", content: "go" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "fc1",
                name: "a",
                arguments: { x: 1 },
                providerMetadata: { geminiCallId: "fc1", thoughtSignature: "SIG" },
              },
              { id: "call_local", name: "b", arguments: {} },
            ],
          },
          { role: "tool", toolCallId: "fc1", name: "a", content: '{"ok":true}' },
          { role: "tool", toolCallId: "call_local", name: "b", content: '"plain"' },
        ],
        tools: [
          {
            name: "a",
            description: "A",
            parameters: { type: "object", properties: { x: { type: "number" } } },
          },
        ],
      }),
    );
    const { url, init } = seen[0] ?? { url: "", init: {} };
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse",
    );
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test");
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Be brief." }] });
    expect(body.tools[0].functionDeclarations[0]).toEqual({
      name: "a",
      description: "A",
      parametersJsonSchema: { type: "object", properties: { x: { type: "number" } } },
    });
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "go" }] },
      {
        role: "model",
        parts: [
          { functionCall: { name: "a", args: { x: 1 }, id: "fc1" }, thoughtSignature: "SIG" },
          { functionCall: { name: "b", args: {} } },
        ],
      },
      {
        role: "user",
        parts: [
          { functionResponse: { name: "a", response: { ok: true }, id: "fc1" } },
          { functionResponse: { name: "b", response: { result: "plain" } } },
        ],
      },
    ]);
  });

  it("sends thinkingBudget only when it is set", async () => {
    const run = async (thinkingBudget?: number) => {
      const bodies: unknown[] = [];
      const p = createGeminiProvider({
        apiKey: "AIza-test",
        model: "gemini-2.5-flash",
        ...(thinkingBudget === undefined ? {} : { thinkingBudget }),
        fetch: async (_url, init) => {
          bodies.push(JSON.parse(String(init?.body)));
          return sseResponse([
            { candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] },
          ]);
        },
      });
      await collect(p.stream({ messages: [{ role: "user", content: "hi" }], tools: [] }));
      return (bodies[0] as { generationConfig: Record<string, unknown> }).generationConfig;
    };
    expect((await run(0)).thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect((await run()).thinkingConfig).toBeUndefined();
  });

  it("maps RESOURCE_EXHAUSTED, bad keys and server errors", async () => {
    const quota = new Response(
      '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}',
      { status: 429 },
    );
    await expect(
      collect(provider(quota).stream({ messages: [], tools: [] })),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const badKey = new Response(
      '{"error":{"status":"INVALID_ARGUMENT","message":"API key not valid."}}',
      { status: 400 },
    );
    await expect(
      collect(provider(badKey).stream({ messages: [], tools: [] })),
    ).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    const down = new Response("oops", { status: 503 });
    await expect(collect(provider(down).stream({ messages: [], tools: [] }))).rejects.toMatchObject(
      { code: "PROVIDER_ERROR", retryable: true },
    );
  });

  it("converts history without tools", () => {
    expect(
      toGeminiContents([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ]),
    ).toEqual({
      contents: [
        { role: "user", parts: [{ text: "a" }] },
        { role: "model", parts: [{ text: "b" }] },
      ],
    });
  });
});

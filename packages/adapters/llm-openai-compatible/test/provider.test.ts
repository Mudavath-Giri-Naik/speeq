import type { LLMStreamChunk } from "@speeq/core";
import { describe, expect, it } from "vitest";
import { createOpenAICompatibleProvider, parseArguments, toOpenAIMessages } from "../src/index.js";

/** Builds a streamed SSE response from data payloads, re-split into `chunkSize`-byte pieces. */
function sseResponse(payloads: unknown[], chunkSize = 7): Response {
  const text = `${payloads.map((p) => `data: ${typeof p === "string" ? p : JSON.stringify(p)}\n\n`).join("")}data: [DONE]\n\n`;
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += chunkSize) c.enqueue(bytes.slice(i, i + chunkSize));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

function provider(response: Response | (() => Response), seen: RequestInit[] = []) {
  return createOpenAICompatibleProvider({
    baseURL: "https://api.groq.com/openai/v1/",
    apiKey: "gsk_test",
    model: "llama-3.3-70b-versatile",
    fetch: async (_url, init) => {
      seen.push(init ?? {});
      return typeof response === "function" ? response() : response;
    },
  });
}

async function collect(iter: AsyncIterable<LLMStreamChunk>) {
  const out: LLMStreamChunk[] = [];
  for await (const c of iter) out.push(c);
  return out;
}

const tools = [
  { name: "count_questions", description: "Count", parameters: { type: "object", properties: {} } },
];

describe("OpenAI-compatible provider", () => {
  it("streams text deltas and usage", async () => {
    const chunks = await collect(
      provider(
        sseResponse([
          { choices: [{ delta: { content: "Hel" } }] },
          { choices: [{ delta: { content: "lo." }, finish_reason: "stop" }] },
          { choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } },
        ]),
      ).stream({ messages: [{ role: "user", content: "hi" }], tools: [] }),
    );
    expect(chunks).toEqual([
      { type: "text-delta", text: "Hel" },
      { type: "text-delta", text: "lo." },
      {
        type: "finish",
        reason: "stop",
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
      },
    ]);
  });

  it("assembles tool calls split across many deltas and byte chunks", async () => {
    const chunks = await collect(
      provider(
        sseResponse(
          [
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      { index: 0, id: "call_a", function: { name: "count_", arguments: "" } },
                    ],
                  },
                },
              ],
            },
            {
              choices: [
                {
                  delta: {
                    tool_calls: [{ index: 0, function: { name: "questions", arguments: '{"sub' } }],
                  },
                },
              ],
            },
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 1,
                        id: "call_b",
                        function: { name: "navigate", arguments: '{"routeId":' },
                      },
                    ],
                  },
                },
              ],
            },
            {
              choices: [
                {
                  delta: {
                    tool_calls: [{ index: 0, function: { arguments: 'ject":"physics"}' } }],
                  },
                },
              ],
            },
            {
              choices: [
                {
                  delta: { tool_calls: [{ index: 1, function: { arguments: '"pricing"}' } }] },
                  finish_reason: "tool_calls",
                },
              ],
            },
            { choices: [], x_groq: { usage: { total_tokens: 11 } } },
          ],
          3,
        ),
      ).stream({ messages: [{ role: "user", content: "go" }], tools }),
    );
    expect(chunks).toEqual([
      {
        type: "tool-call",
        call: { id: "call_a", name: "count_questions", arguments: { subject: "physics" } },
      },
      {
        type: "tool-call",
        call: { id: "call_b", name: "navigate", arguments: { routeId: "pricing" } },
      },
      { type: "finish", reason: "tool_calls", usage: { totalTokens: 11 } },
    ]);
  });

  it("sends the right request body", async () => {
    const seen: RequestInit[] = [];
    await collect(
      provider(sseResponse([{ choices: [{ delta: { content: "ok" } }] }]), seen).stream({
        messages: [
          { role: "system", content: "sys" },
          { role: "user", content: "hi" },
          {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "c1", name: "x", arguments: { a: 1 } }],
          },
          { role: "tool", toolCallId: "c1", name: "x", content: '{"ok":true}' },
        ],
        tools,
        temperature: 0.2,
      }),
    );
    const init = seen[0] ?? {};
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer gsk_test");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "llama-3.3-70b-versatile",
      stream: true,
      temperature: 0.2,
      tool_choice: "auto",
      stream_options: { include_usage: true },
    });
    expect(body.tools[0]).toEqual({ type: "function", function: tools[0] });
    expect(body.messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "x", arguments: '{"a":1}' } }],
    });
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "c1", content: '{"ok":true}' });
  });

  it("maps 429 to RATE_LIMITED with the retry-after hint", async () => {
    const res = new Response('{"error":{"message":"Rate limit reached for model"}}', {
      status: 429,
      headers: { "retry-after": "7" },
    });
    await expect(collect(provider(res).stream({ messages: [], tools: [] }))).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfterMs: 7000,
    });
  });

  it("maps quota errors in other statuses, bad keys, and server errors", async () => {
    const quota = new Response(
      '{"error":{"code":"rate_limit_exceeded","message":"tokens per day"}}',
      { status: 413 },
    );
    await expect(
      collect(provider(quota).stream({ messages: [], tools: [] })),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const key = new Response('{"error":"invalid api key"}', { status: 401 });
    await expect(collect(provider(key).stream({ messages: [], tools: [] }))).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
    });
    const down = new Response("bad gateway", { status: 502 });
    const err = await collect(provider(down).stream({ messages: [], tools: [] })).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: "PROVIDER_ERROR", retryable: true });
    expect((err as Error).message).not.toContain("bad gateway");
  });

  it("maps network failures and in-stream errors", async () => {
    const failing = createOpenAICompatibleProvider({
      baseURL: "http://x",
      model: "m",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(collect(failing.stream({ messages: [], tools: [] }))).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    const midStream = sseResponse([
      { choices: [{ delta: { content: "a" } }] },
      { error: { message: "quota exceeded" } },
    ]);
    await expect(
      collect(provider(midStream).stream({ messages: [], tools: [] })),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const p = provider(() => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      collect(p.stream({ messages: [], tools: [], signal: controller.signal })),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("parses arguments defensively and converts messages", () => {
    expect(parseArguments("")).toEqual({});
    expect(parseArguments("{bad")).toEqual({ __invalidJson: "{bad" });
    expect(toOpenAIMessages([{ role: "assistant", content: "hi" }])).toEqual([
      { role: "assistant", content: "hi" },
    ]);
  });
});

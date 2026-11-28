import type { LLMProvider, LLMStreamChunk } from "@speeq/core";
import { createMemoryStore } from "@speeq/store-memory";
import { startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { createSpeeq } from "../src/index.js";

/** A model that answers after `delayMs` (or never), and honours the abort signal. */
function slowModel(delayMs: number, chunks = 1): LLMProvider {
  return {
    kind: "slow",
    async *stream(request): AsyncIterable<LLMStreamChunk> {
      for (let i = 0; i < chunks; i++) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, delayMs);
          request.signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        });
        yield { type: "text-delta", text: `part ${i} ` };
      }
      yield { type: "finish", reason: "stop" } as LLMStreamChunk;
    },
  } as LLMProvider;
}

function speeqWith(llm: LLMProvider, modelTimeoutMs: number) {
  return createSpeeq({
    secret: "timeout-secret-timeout-secret-12345",
    agent: { name: "A", instructions: "x", modelTimeoutMs },
    llm,
    store: createMemoryStore({ quiet: true }),
    logger: { error: () => undefined, warn: () => undefined },
    updateCheck: false,
  });
}

describe("model timeout", () => {
  it("ends a silent model call with a clear timeout instead of waiting forever", async () => {
    const speeq = speeqWith(slowModel(60_000), 3000);
    const s = await startSession(speeq.handler);
    const started = Date.now();
    const events = await s.turn("hi");
    expect(Date.now() - started).toBeLessThan(6000);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "error",
        code: "PROVIDER_ERROR",
        reason: "timeout",
        retryable: true,
        message: "That took too long. Please try again.",
      }),
    );
    expect(events.at(-1)).toMatchObject({ type: "turn.finished", reason: "error" });
  }, 15_000);

  it("does not cut off a model that keeps streaming", async () => {
    const speeq = speeqWith(slowModel(1200, 4), 3000);
    const s = await startSession(speeq.handler);
    const events = await s.turn("hi");
    expect(events.find((e) => e.type === "error")).toBeUndefined();
    expect(events.at(-1)).toMatchObject({ type: "turn.finished", reason: "completed" });
  }, 15_000);
});

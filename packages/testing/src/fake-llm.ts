import type { LLMProvider, LLMRequest, LLMStreamChunk, LLMToolCall, Usage } from "@speeq/core";
import { createId, sleep } from "@speeq/core/utils";

/** One scripted model reply for {@link FakeLLMProvider}. */
export interface FakeStep {
  /** Text to stream (split into word-sized deltas). */
  text?: string;
  /** Tool calls to emit after the text. `id` is generated when omitted. */
  toolCalls?: Array<Omit<LLMToolCall, "id"> & { id?: string }>;
  /** Throw this error instead of replying (after streaming `text`, if any). */
  error?: unknown;
  usage?: Usage;
  /** Wait this long before each delta (to test latency and aborts). */
  delayMs?: number;
}

/** A script: a fixed list of steps (one per LLM call), or a function of the request. */
export type FakeScript = FakeStep[] | ((request: LLMRequest, callIndex: number) => FakeStep);

/**
 * An {@link LLMProvider} that replays a script. Every request is recorded in `requests` so tests
 * can assert on prompts, tool definitions and history.
 *
 * @example
 * const llm = new FakeLLMProvider([
 *   { toolCalls: [{ name: "navigate", arguments: { routeId: "pricing" } }] },
 *   { text: "Opening pricing." },
 * ]);
 */
export class FakeLLMProvider implements LLMProvider {
  readonly kind: string;
  readonly model: string;
  /** Every request received, in order. */
  readonly requests: LLMRequest[] = [];
  private readonly script: FakeScript;

  constructor(script: FakeScript, options: { kind?: string; model?: string } = {}) {
    this.script = script;
    this.kind = options.kind ?? "fake";
    this.model = options.model ?? "fake-model";
  }

  /** Number of LLM calls made so far. */
  get callCount(): number {
    return this.requests.length;
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const index = this.requests.length;
    this.requests.push(structuredClone({ ...request, signal: undefined }));
    const step =
      typeof this.script === "function"
        ? this.script(request, index)
        : (this.script[index] ?? { text: "" });
    yield* playStep(step, request.signal);
  }
}

/** Streams one {@link FakeStep} as normalized chunks. Shared with the mock provider. */
export async function* playStep(
  step: FakeStep,
  signal?: AbortSignal,
): AsyncIterable<LLMStreamChunk> {
  if (step.text) {
    for (const piece of step.text.match(/\S+\s*|\s+/g) ?? []) {
      if (step.delayMs) await sleep(step.delayMs, signal);
      signal?.throwIfAborted();
      yield { type: "text-delta", text: piece };
    }
  }
  if (step.error !== undefined) throw step.error;
  const calls = step.toolCalls ?? [];
  for (const call of calls) {
    yield { type: "tool-call", call: { ...call, id: call.id ?? createId("call") } };
  }
  const finish: LLMStreamChunk = {
    type: "finish",
    reason: calls.length > 0 ? "tool_calls" : "stop",
  };
  if (step.usage) finish.usage = step.usage;
  yield finish;
}

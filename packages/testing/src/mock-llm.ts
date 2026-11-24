import type { LLMMessage, LLMProvider, LLMRequest, LLMStreamChunk } from "@speeq/core";
import { type FakeStep, playStep } from "./fake-llm.js";

/** What a {@link MockRule} sees when deciding how to reply. */
export interface MockRuleInput {
  /** The latest user message text. */
  text: string;
  /** The same text, lower-cased and trimmed. */
  normalized: string;
  /** The full request (messages, tools). */
  request: LLMRequest;
  /** True if a tool with this name is offered in the request. */
  hasTool(name: string): boolean;
}

/** One keyword rule: when `match` hits, reply with `respond`. */
export interface MockRule {
  /** A regex tested against the normalized text, or a predicate. */
  match: RegExp | ((input: MockRuleInput) => boolean);
  respond(input: MockRuleInput, match: RegExpMatchArray | null): FakeStep;
}

/** What {@link MockLLMOptions.afterTool} sees after a tool ran. */
export interface MockAfterToolInput {
  toolName: string;
  /** The tool result text the model would see (JSON string or error message). */
  result: string;
  /** The user's original text in this turn. */
  userText: string;
  request: LLMRequest;
}

/** Options for {@link createMockLLMProvider}. */
export interface MockLLMOptions {
  rules: MockRule[];
  /** Reply when no rule matches. */
  fallback?: (input: MockRuleInput) => FakeStep;
  /** Reply after tool results arrive. Defaults to a short generic summary. */
  afterTool?: (input: MockAfterToolInput) => FakeStep;
  /** Delay per streamed word, to feel like a real model. Default 0. */
  delayMs?: number;
}

/**
 * A keyword-based {@link LLMProvider} so apps can run with no API key ("mock mode"). It is
 * deterministic: rules are checked in order against the latest user message. After tool results
 * it calls `afterTool`. It is not a real model. Use it for demos, e2e tests and first-run setup.
 */
export function createMockLLMProvider(options: MockLLMOptions): LLMProvider {
  return {
    kind: "mock",
    model: "mock-keywords",
    async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
      const step = decide(request, options);
      yield* playStep(
        options.delayMs ? { ...step, delayMs: options.delayMs } : step,
        request.signal,
      );
    },
  };
}

function decide(request: LLMRequest, options: MockLLMOptions): FakeStep {
  const messages = request.messages;
  const last = messages.at(-1);
  const userText = lastUserText(messages);
  if (last?.role === "tool") {
    const results = trailingToolMessages(messages);
    const summarize = options.afterTool ?? defaultAfterTool;
    const parts = results.map(
      (m) => summarize({ toolName: m.name, result: m.content, userText, request }).text ?? "",
    );
    return { text: parts.filter(Boolean).join(" ") || "Done." };
  }
  const input: MockRuleInput = {
    text: userText,
    normalized: userText.toLowerCase().trim(),
    request,
    hasTool: (name) => request.tools.some((t) => t.name === name),
  };
  for (const rule of options.rules) {
    if (typeof rule.match === "function") {
      if (rule.match(input)) return rule.respond(input, null);
      continue;
    }
    const m = input.normalized.match(rule.match);
    if (m) return rule.respond(input, m);
  }
  return options.fallback?.(input) ?? { text: "Sorry, I did not understand that (mock mode)." };
}

function lastUserText(messages: LLMMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "user") return m.content;
  }
  return "";
}

function trailingToolMessages(messages: LLMMessage[]) {
  const out: Array<Extract<LLMMessage, { role: "tool" }>> = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "tool") break;
    out.unshift(m);
  }
  return out;
}

function defaultAfterTool({ toolName, result }: MockAfterToolInput): FakeStep {
  if (toolName === "navigate") return { text: "Done, opening it now." };
  return { text: `Here is what I found: ${result.slice(0, 300)}` };
}

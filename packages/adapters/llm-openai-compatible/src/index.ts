/**
 * `@speeq/llm-openai-compatible`: an {@link LLMProvider} for any OpenAI-compatible
 * `/chat/completions` endpoint (Groq, OpenRouter, Ollama, OpenAI, …), using plain `fetch`.
 * @packageDocumentation
 */
import {
  type LLMFinishReason,
  type LLMMessage,
  type LLMProvider,
  type LLMRequest,
  type LLMStreamChunk,
  type LLMToolCall,
  mapProviderHttpError,
  providerFetch,
  readSseData,
  SpeeqError,
  safeJsonParse,
  type Usage,
} from "@speeq/core";

/** Options for {@link createOpenAICompatibleProvider}. */
export interface OpenAICompatibleOptions {
  /** API base URL, e.g. `https://api.groq.com/openai/v1`. */
  baseURL: string;
  /** Sent as `Authorization: Bearer …`. Optional for local servers such as Ollama. */
  apiKey?: string;
  /** Model id. Read it from an env var: free-tier model ids change often. */
  model: string;
  /** Extra headers (e.g. OpenRouter's `HTTP-Referer`). */
  headers?: Record<string, string>;
  /** Default sampling temperature. */
  temperature?: number;
  /** Maximum output tokens per call (`max_completion_tokens`). Default 1024. */
  maxOutputTokens?: number;
  /** Ask for token usage in the stream (`stream_options.include_usage`). Default `true`. */
  includeUsage?: boolean;
  /** Telemetry kind. Default `openai-compatible`. */
  kind?: string;
  /** Custom fetch (tests, proxies). */
  fetch?: typeof fetch;
}

interface ToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface ChunkBody {
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: ToolCallDelta[] };
    finish_reason?: string | null;
  }>;
  usage?: RawUsage | null;
  x_groq?: { usage?: RawUsage };
  error?: { message?: string; code?: string | number; type?: string };
}

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** Converts normalized messages to the OpenAI wire format. */
export function toOpenAIMessages(messages: LLMMessage[]): unknown[] {
  return messages.map((m) => {
    switch (m.role) {
      case "assistant":
        if (!m.toolCalls?.length) return { role: "assistant", content: m.content };
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
          })),
        };
      case "tool":
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      default:
        return { role: m.role, content: m.content };
    }
  });
}

function mapFinish(reason: string | null | undefined): LLMFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      return "other";
  }
}

function toUsage(raw: RawUsage | null | undefined): Usage | undefined {
  if (!raw) return undefined;
  const u: Usage = {};
  if (raw.prompt_tokens !== undefined) u.inputTokens = raw.prompt_tokens;
  if (raw.completion_tokens !== undefined) u.outputTokens = raw.completion_tokens;
  if (raw.total_tokens !== undefined) u.totalTokens = raw.total_tokens;
  return u;
}

/** Parses streamed tool-call arguments. Empty means `{}`; invalid JSON is kept for the model to see. */
export function parseArguments(raw: string): unknown {
  if (!raw.trim()) return {};
  const parsed = safeJsonParse(raw);
  return parsed.ok ? parsed.value : { __invalidJson: raw };
}

/**
 * Creates a provider for an OpenAI-compatible endpoint.
 *
 * @example
 * createOpenAICompatibleProvider({
 *   baseURL: "https://api.groq.com/openai/v1",
 *   apiKey: process.env.GROQ_API_KEY,
 *   model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
 * });
 */
export function createOpenAICompatibleProvider(options: OpenAICompatibleOptions): LLMProvider {
  const kind = options.kind ?? "openai-compatible";
  const url = `${options.baseURL.replace(/\/+$/, "")}/chat/completions`;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    kind,
    model: options.model,
    async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
      const body: Record<string, unknown> = {
        model: options.model,
        messages: toOpenAIMessages(request.messages),
        stream: true,
        max_completion_tokens: request.maxOutputTokens ?? options.maxOutputTokens ?? 1024,
      };
      const temperature = request.temperature ?? options.temperature;
      if (temperature !== undefined) body.temperature = temperature;
      if (options.includeUsage !== false) body.stream_options = { include_usage: true };
      if (request.tools.length > 0) {
        body.tools = request.tools.map((t) => ({
          type: "function",
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        body.tool_choice = "auto";
      }
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...options.headers,
      };
      if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;

      const init: RequestInit = { method: "POST", headers, body: JSON.stringify(body) };
      if (request.signal) init.signal = request.signal;
      const res = await providerFetch(kind, fetchImpl, url, init);
      if (!res.ok || !res.body) {
        throw mapProviderHttpError(
          kind,
          res.status,
          await res.text().catch(() => ""),
          res.headers.get("retry-after"),
        );
      }

      const pending = new Map<number, { id: string; name: string; args: string }>();
      let finish: LLMFinishReason | null = null;
      let usage: Usage | undefined;
      for await (const data of readSseData(res.body, request.signal)) {
        const parsed = safeJsonParse<ChunkBody>(data);
        if (!parsed.ok) continue;
        const chunk = parsed.value;
        if (chunk.error) throw mapProviderHttpError(kind, 500, JSON.stringify(chunk.error));
        usage = toUsage(chunk.usage ?? chunk.x_groq?.usage) ?? usage;
        for (const choice of chunk.choices ?? []) {
          const content = choice.delta?.content;
          if (content) yield { type: "text-delta", text: content };
          for (const d of choice.delta?.tool_calls ?? []) {
            const index = d.index ?? pending.size;
            const entry = pending.get(index) ?? { id: "", name: "", args: "" };
            if (d.id) entry.id = d.id;
            if (d.function?.name) entry.name += d.function.name;
            if (d.function?.arguments) entry.args += d.function.arguments;
            pending.set(index, entry);
          }
          if (choice.finish_reason) finish = mapFinish(choice.finish_reason);
        }
      }

      const calls = [...pending.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
      for (const [i, c] of calls.entries()) {
        if (!c.name)
          throw new SpeeqError("PROVIDER_ERROR", {
            message: "The model sent an incomplete tool call.",
          });
        const call: LLMToolCall = {
          id: c.id || `call_${i}`,
          name: c.name,
          arguments: parseArguments(c.args),
        };
        yield { type: "tool-call", call };
      }
      const reason = calls.length > 0 ? "tool_calls" : (finish ?? "stop");
      yield usage ? { type: "finish", reason, usage } : { type: "finish", reason };
    },
  };
}

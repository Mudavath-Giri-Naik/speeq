/**
 * `@speeq/llm-gemini`: an {@link LLMProvider} for the Google Gemini API
 * (`streamGenerateContent`) with function calling, using plain `fetch`.
 * @packageDocumentation
 */
import {
  createId,
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

/** Options for {@link createGeminiProvider}. */
export interface GeminiOptions {
  apiKey: string;
  /** Model id, e.g. `gemini-3.8-flash`. Read it from an env var: model ids change often. */
  model: string;
  /** Default `https://generativelanguage.googleapis.com/v1beta`. */
  baseURL?: string;
  temperature?: number;
  /** Default 1024. */
  maxOutputTokens?: number;
  /**
   * How many tokens the model may spend "thinking" before it answers. `0` turns thinking off,
   * which makes replies start much sooner (supported by `gemini-2.5-*` models; leave it unset for
   * models that must think). Unset by default.
   */
  thinkingBudget?: number;
  /**
   * `parametersJsonSchema` (default) accepts full JSON Schema. Use `parameters` for older
   * models that only accept the OpenAPI subset.
   */
  schemaField?: "parametersJsonSchema" | "parameters";
  /** Custom fetch (tests, proxies). */
  fetch?: typeof fetch;
}

/** A Gemini content part (only the fields speeq uses). */
export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
}

/** A Gemini content (one turn). */
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface StreamChunk {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

/**
 * Converts normalized messages to Gemini `systemInstruction` + `contents`. Assistant tool calls
 * carry their `thoughtSignature` back (required by Gemini 3+ for function calling), and
 * consecutive tool results are merged into one `user` turn of `functionResponse` parts.
 */
export function toGeminiContents(messages: LLMMessage[]): {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
} {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content);
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") contents.push({ role: "user", parts: [{ text: m.content }] });
    if (m.role === "assistant") {
      const parts: GeminiPart[] = m.content ? [{ text: m.content }] : [];
      for (const c of m.toolCalls ?? []) {
        const meta = c.providerMetadata ?? {};
        const part: GeminiPart = {
          functionCall: { name: c.name, args: asObject(c.arguments) },
        };
        if (typeof meta.geminiCallId === "string" && part.functionCall)
          part.functionCall.id = meta.geminiCallId;
        if (typeof meta.thoughtSignature === "string")
          part.thoughtSignature = meta.thoughtSignature;
        parts.push(part);
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
    }
    if (m.role === "tool") {
      const id = findGeminiCallId(messages, m.toolCallId);
      const part: GeminiPart = {
        functionResponse: { name: m.name, response: toResponseObject(m.content) },
      };
      if (id && part.functionResponse) part.functionResponse.id = id;
      const last = contents.at(-1);
      if (last?.role === "user" && last.parts.every((p) => p.functionResponse))
        last.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
    }
  }
  return system.length > 0
    ? { systemInstruction: { parts: [{ text: system.join("\n\n") }] }, contents }
    : { contents };
}

function findGeminiCallId(messages: LLMMessage[], callId: string): string | undefined {
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const call = m.toolCalls?.find((c) => c.id === callId);
    const id = call?.providerMetadata?.geminiCallId;
    if (typeof id === "string") return id;
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toResponseObject(content: string): Record<string, unknown> {
  const parsed = safeJsonParse(content);
  if (
    parsed.ok &&
    typeof parsed.value === "object" &&
    parsed.value !== null &&
    !Array.isArray(parsed.value)
  ) {
    return parsed.value as Record<string, unknown>;
  }
  return { result: parsed.ok ? parsed.value : content };
}

function mapFinish(reason: string | undefined): LLMFinishReason {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "content_filter";
    default:
      return "other";
  }
}

const BAD_KEY_RE = /API_KEY_INVALID|API key not valid/i;

/**
 * Creates a Gemini provider.
 *
 * @example
 * createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY!, model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash" });
 */
export function createGeminiProvider(options: GeminiOptions): LLMProvider {
  const base = (options.baseURL ?? "https://generativelanguage.googleapis.com/v1beta").replace(
    /\/+$/,
    "",
  );
  const url = `${base}/models/${encodeURIComponent(options.model)}:streamGenerateContent?alt=sse`;
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const schemaField = options.schemaField ?? "parametersJsonSchema";

  return {
    kind: "gemini",
    model: options.model,
    async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
      const body: Record<string, unknown> = {
        ...toGeminiContents(request.messages),
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens ?? options.maxOutputTokens ?? 1024,
          ...((request.temperature ?? options.temperature) !== undefined
            ? { temperature: request.temperature ?? options.temperature }
            : {}),
          ...(options.thinkingBudget !== undefined
            ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
            : {}),
        },
      };
      if (request.tools.length > 0) {
        body.tools = [
          {
            functionDeclarations: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              [schemaField]: t.parameters,
            })),
          },
        ];
        body.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
      }
      const init: RequestInit = {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
        body: JSON.stringify(body),
      };
      if (request.signal) init.signal = request.signal;
      const res = await providerFetch("gemini", fetchImpl, url, init);
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        if (BAD_KEY_RE.test(text)) {
          throw new SpeeqError("NOT_CONFIGURED", {
            reason: "invalid_key",
            details: { provider: "gemini", status: res.status, reason: "invalid_key" },
          });
        }
        throw mapProviderHttpError("gemini", res.status, text, res.headers.get("retry-after"));
      }

      const calls: LLMToolCall[] = [];
      let finish: LLMFinishReason | null = null;
      let usage: Usage | undefined;
      for await (const data of readSseData(res.body, request.signal)) {
        const parsed = safeJsonParse<StreamChunk>(data);
        if (!parsed.ok) continue;
        const chunk = parsed.value;
        if (chunk.error) throw mapProviderHttpError("gemini", 500, JSON.stringify(chunk.error));
        const u = chunk.usageMetadata;
        if (u) {
          usage = {};
          if (u.promptTokenCount !== undefined) usage.inputTokens = u.promptTokenCount;
          if (u.candidatesTokenCount !== undefined) usage.outputTokens = u.candidatesTokenCount;
          if (u.totalTokenCount !== undefined) usage.totalTokens = u.totalTokenCount;
        }
        const candidate = chunk.candidates?.[0];
        for (const part of candidate?.content?.parts ?? []) {
          if (part.thought) continue;
          if (part.text) yield { type: "text-delta", text: part.text };
          if (part.functionCall) {
            const providerMetadata: Record<string, unknown> = {};
            if (part.functionCall.id) providerMetadata.geminiCallId = part.functionCall.id;
            if (part.thoughtSignature) providerMetadata.thoughtSignature = part.thoughtSignature;
            calls.push({
              id: part.functionCall.id ?? createId("call"),
              name: part.functionCall.name,
              arguments: part.functionCall.args ?? {},
              ...(Object.keys(providerMetadata).length > 0 ? { providerMetadata } : {}),
            });
          }
        }
        if (candidate?.finishReason) finish = mapFinish(candidate.finishReason);
      }
      for (const call of calls) yield { type: "tool-call", call };
      const reason = calls.length > 0 ? "tool_calls" : (finish ?? "stop");
      yield usage ? { type: "finish", reason, usage } : { type: "finish", reason };
    },
  };
}

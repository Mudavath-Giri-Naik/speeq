# @speeq/llm-openai-compatible

An `LLMProvider` for [speeq](../../../README.md) that talks to any OpenAI-compatible
`/chat/completions` endpoint with streaming and tool calling. It uses plain `fetch`, with no SDK.

```bash
pnpm add @speeq/llm-openai-compatible
```

## Groq (free tier, no credit card)

```ts
import { createOpenAICompatibleProvider } from "@speeq/llm-openai-compatible";

export const llm = createOpenAICompatibleProvider({
  baseURL: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
});
```

The default model was checked against [Groq's model list](https://console.groq.com/docs/models)
on 2026-11-24: it is a production model that supports tool use. Free-tier model ids change often,
so always read the id from an env var.

## Other endpoints

| Service        | `baseURL`                        | Notes                          |
| -------------- | -------------------------------- | ------------------------------ |
| Groq           | `https://api.groq.com/openai/v1` | Free key at console.groq.com   |
| OpenRouter     | `https://openrouter.ai/api/v1`   | Pick a model with tool support |
| Ollama (local) | `http://localhost:11434/v1`      | No `apiKey` needed             |
| OpenAI         | `https://api.openai.com/v1`      | Paid                           |

## Options

| Option             | Default             | Meaning                                                                             |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| `baseURL`, `model` | required            | Endpoint and model id                                                               |
| `apiKey`           | none                | Sent as a bearer token                                                              |
| `headers`          | none                | Extra headers                                                                       |
| `temperature`      | provider default    | Sampling temperature                                                                |
| `maxOutputTokens`  | `1024`              | Sent as `max_completion_tokens`                                                     |
| `includeUsage`     | `true`              | Request token usage in the stream; set `false` if a server rejects `stream_options` |
| `kind`             | `openai-compatible` | Name reported in anonymous telemetry                                                |
| `fetch`            | global `fetch`      | For tests and proxies                                                               |

## Errors

HTTP 429, or a body that mentions rate limits or quota, becomes `RATE_LIMITED` with a retry hint
taken from `Retry-After`. 401/403 becomes `NOT_CONFIGURED`. Everything else becomes
`PROVIDER_ERROR`. The provider's raw message is kept only in `error.details` for your server logs.

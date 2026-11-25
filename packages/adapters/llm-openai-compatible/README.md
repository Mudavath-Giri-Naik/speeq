# @speeq/llm-openai-compatible

An `LLMProvider` for [speeq](../../../README.md) that talks to any OpenAI-compatible
`/chat/completions` endpoint with streaming and tool calling. It uses plain `fetch`, with no SDK.

```bash
pnpm add @speeq/llm-openai-compatible@next
```

## Configure a server endpoint

```ts
import { createOpenAICompatibleProvider } from "@speeq/llm-openai-compatible";

export const llm = createOpenAICompatibleProvider({
  baseURL: process.env.GROQ_BASE_URL!,
  apiKey: process.env.GROQ_API_KEY,
  model: process.env.GROQ_MODEL!,
});
```

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

[Related guide or reference](../../../docs/guides/llm-providers.md)

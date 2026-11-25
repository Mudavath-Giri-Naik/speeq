# @speeq/llm-gemini

An `LLMProvider` for [speeq](../../../README.md) that uses the Google Gemini API
(`streamGenerateContent`) with function calling. It uses plain `fetch`, with no SDK.

```bash
pnpm add @speeq/llm-gemini@next
```

```ts
import { createGeminiProvider } from "@speeq/llm-gemini";

export const llm = createGeminiProvider({
  apiKey: process.env.GEMINI_API_KEY!,
  model: process.env.GEMINI_MODEL!,
});
```

Choose a model that supports function calling. Pass its ID in server-side configuration.

## What the adapter handles for you

- `system` messages go into `systemInstruction`.
- Tool schemas are sent as `parametersJsonSchema` (full JSON Schema). Set
  `schemaField: "parameters"` for older models.
- **Thought signatures:** Gemini 3+ returns a `thoughtSignature` on function calls and rejects the
  next request (400) unless it is sent back. The adapter keeps the signature and the call `id` in
  `providerMetadata`. `@speeq/server` stores them in your audit log and replays them, so this also
  works across serverless requests.
- Tool results are sent as `functionResponse` parts with the matching `id`.
- `thought` parts (model reasoning) are never streamed to users.

## Errors

429 / `RESOURCE_EXHAUSTED` becomes `RATE_LIMITED`. An invalid key (Gemini returns 400
`API_KEY_INVALID`) and HTTP 401/403 become `NOT_CONFIGURED`. Other provider failures map to `PROVIDER_ERROR`.

[Related guide or reference](../../../docs/guides/llm-providers.md)

# @speeq/llm-gemini

An `LLMProvider` for [speeq](../../../README.md) that uses the Google Gemini API
(`streamGenerateContent`) with function calling. It uses plain `fetch`, with no SDK.

```bash
pnpm add @speeq/llm-gemini
```

```ts
import { createGeminiProvider } from "@speeq/llm-gemini";

export const llm = createGeminiProvider({
  apiKey: process.env.GEMINI_API_KEY!,
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
});
```

Get a free key at [Google AI Studio](https://aistudio.google.com/apikey), no credit card needed.
The default model was checked against the
[Gemini pricing page](https://ai.google.dev/gemini-api/docs/pricing) on 2026-11-24: it is a stable
model with a free tier and function calling. `gemini-3.5-flash-lite` is a lighter free option.
Free-tier requests may be used by Google to improve its products, so read their terms. Always set
the model through an env var.

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
`API_KEY_INVALID`) becomes `NOT_CONFIGURED`. Everything else becomes `PROVIDER_ERROR`.

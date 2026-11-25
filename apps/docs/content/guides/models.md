---

title: Connect a model
description: Use Groq, Gemini, any OpenAI-style service, or a fake model for tests.
---

# Connect a model

**What you will learn:** how to switch from the fake model to a real one.

The **model** (also called the LLM) is the AI that reads the conversation and decides what to say or which tool to run. speeq does not include one. You pick a provider and pass it as `llm`.

## OpenAI-style services (like Groq)

Many services speak the same chat format. One adapter covers them all:

```ts
import { createOpenAICompatibleProvider } from "speeq/llm-openai-compatible";

const llm = createOpenAICompatibleProvider({
  baseURL: process.env.LLM_BASE_URL!, // for Groq: https://api.groq.com/openai/v1
  apiKey: process.env.LLM_API_KEY!,
  model: process.env.LLM_MODEL!,
});
```

A local service can leave out `apiKey`. If your service rejects the usage option on streams, set `includeUsage` to `false`.

## Google Gemini

```ts
import { createGeminiProvider } from "speeq/llm-gemini";

const llm = createGeminiProvider({
  apiKey: process.env.GEMINI_API_KEY!,
  model: process.env.GEMINI_MODEL!,
});
```

## The fake model

For demos and tests, use the mock:

```ts
import { createMockLLMProvider } from "speeq/testing";

const llm = createMockLLMProvider({
  rules: [{ match: /hello/, respond: () => ({ text: "Hi!" }) }],
});
```

For tests that need an exact order of replies, see [Test without a model](/docs/guides/testing).

## Keep keys on the server

> **Warning** API keys belong in server environment variables. Never put a key in browser code or in a variable that starts with `NEXT_PUBLIC_`. Do not commit `.env` files.

## Write your own provider

A provider is an object with a `kind`, a `model` name, and a `stream(request)` method that yields text pieces and tool calls. It must stop when the abort signal fires. Look at the two built-in adapters in the repository for a full example.

## Next steps

- [Choose a store](/docs/guides/stores)
- [Go to production](/docs/guides/deployment)

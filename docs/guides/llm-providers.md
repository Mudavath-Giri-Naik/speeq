# Connect a model

Pass an `LLMProvider` as `llm`. For a chat-completions service such as Groq, call `createOpenAICompatibleProvider({ baseURL, apiKey, model })` from `@speeq/llm-openai-compatible`. Use a server-side base URL and model from your configuration. Local services can omit the API key. Disable `includeUsage` for endpoints that reject streamed usage requests.

For Gemini, import `createGeminiProvider` from `@speeq/llm-gemini` and pass `{ apiKey, model }`. The adapter carries tool-call IDs and thought signatures through subsequent tool results. Both adapters use Fetch, support streaming and accept a custom `fetch` for tests.

For a new adapter, implement `kind`, `model` and an async iterable `stream(request)`. Translate normalized messages and tool definitions, yield text deltas and complete tool calls, and end with a finish reason. Respect the abort signal. Map service failures to stable error codes. [Minimal provider implementation](../../packages/core/README.md)

For an offline app, use `createMockLLMProvider({ rules })`. For deterministic sequences of calls in tests, use `FakeLLMProvider`. [Testing](testing.md)

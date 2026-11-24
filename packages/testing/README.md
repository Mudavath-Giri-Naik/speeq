# @speeq/testing

Test doubles for [speeq](../../README.md).

```bash
pnpm add -D @speeq/testing
```

| Export                                                           | Use it for                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `FakeLLMProvider`                                                | Scripted model replies (text, tool calls, errors) and recorded requests |
| `createMockLLMProvider`                                          | Keyword rules that act like a model, for **mock mode** with no API key  |
| `FakeSpeechInput` / `FakeSpeechOutput`                           | Driving the browser client without a microphone or speakers             |
| `startSession`, `readSseEvents`, `jsonRequest`                   | Calling a speeq handler in tests and collecting SSE events              |
| `runConversationStoreContract` (`@speeq/testing/store-contract`) | Checking that a store adapter behaves correctly                         |

```ts
import { createSpeeq } from "@speeq/server";
import { FakeLLMProvider, startSession } from "@speeq/testing";

const llm = new FakeLLMProvider([
  { toolCalls: [{ name: "navigate", arguments: { routeId: "pricing" } }] },
  { text: "Opening pricing." },
]);
const speeq = createSpeeq({ /* …, */ llm });
const session = await startSession(speeq.handler);
const events = await session.turn("take me to pricing");
```

The main entry has no Vitest dependency, so apps can use `createMockLLMProvider` at runtime.
The store contract needs Vitest (an optional peer dependency).

# Test conversations without a model service

Pass `new FakeLLMProvider([{ text: "Hello." }])` as the model and a fresh memory store to your server. Exercise the public handler with `startSession`:

```ts
import { assistantText, startSession } from "@speeq/testing";
import type { Speeq } from "@speeq/server";
export async function greet(sdk: Speeq) {
  const session = await startSession(sdk.handler);
  return assistantText(await session.turn("hello"));
}
```

For a write, script a tool call followed by a reply. Find the `confirmation.required` event in the first turn, use `session.confirm(id, true)`, and assert the effect occurred once. Use `jsonRequest` and `readSseEvents` for lower-level assertions. `FakeSpeechInput` and `FakeSpeechOutput` let client tests run without hardware. The main testing entry works without Vitest. Its `store-contract` subpath uses Vitest. [Store guide](stores.md)

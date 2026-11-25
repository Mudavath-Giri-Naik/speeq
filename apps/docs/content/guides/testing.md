---

title: Test without a model
description: Run full conversations in your tests with a fake model, no network, and no keys.
---

# Test without a model

**What you will learn:** how to test your tools and flows quickly and for free.

The `speeq/testing` package gives you a **fake model**. You tell it exactly what to say or which tool to call. Your tests then run in milliseconds and give the same result every time.

## A simple test

```ts
import { FakeLLMProvider, assistantText, startSession } from "speeq/testing";
import type { Speeq } from "speeq/server";

export async function greet(sdk: Speeq) {
  const session = await startSession(sdk.handler);
  return assistantText(await session.turn("hello"));
}
```

Create your server with the fake model and a fresh memory store:

```ts
const llm = new FakeLLMProvider([{ text: "Hello." }]);
```

`startSession` talks to your real handler, so you test the same code that runs in production.

## Test a change that needs a Yes

For a write tool, script two steps: first the tool call, then a final reply. In your test:

1. Send the turn. Find the `confirmation.required` event.
2. Call `session.confirm(id, true)` to approve it.
3. Check that the change happened **exactly once**.

Also test the Reject path. Nothing should change.

## Other helpers

- `jsonRequest` and `readSseEvents` let you check the raw messages.
- `FakeSpeechInput` and `FakeSpeechOutput` let browser tests run without a microphone.
- The main entry works without any test runner. The `store-contract` entry uses Vitest.

## Next steps

- [Choose a store](/docs/guides/stores)
- [Asking before changes](/docs/concepts/confirmations)

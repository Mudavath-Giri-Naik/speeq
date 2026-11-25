# speeq

Install the SDK with `npm i speeq zod`. For the pre-1.0 release channel, use `npm i speeq@next zod@4`. The root and `speeq/core` expose the environment-neutral core contracts and schemas.

```ts
import { createSpeeq } from "speeq/server";
import { createMemoryStore } from "speeq/store-memory";
import { FakeLLMProvider } from "speeq/testing";

const sdk = createSpeeq({
  agent: { name: "Helper", instructions: "Greet the visitor." },
  store: createMemoryStore(),
  llm: new FakeLLMProvider([{ text: "Hello." }]),
});
```

Use `speeq/client` for browser state, `speeq/react` for hooks, and `speeq/server/next` for the Next.js handler. LLM adapters are available at `speeq/llm-openai-compatible` and `speeq/llm-gemini`. Each entry re-exports its corresponding scoped package.

Install React 18 or newer for the hooks. Install `mongodb` 6 or newer and supply your connected database for `speeq/store-mongodb`. Importing the MongoDB entry without the driver produces Node’s standard module-not-found error. Both peers are optional, so a default install does not add React or the MongoDB driver.

[Next.js guide](https://github.com/Mudavath-Giri-Naik/speeq/blob/main/docs/guides/nextjs.md)

# speeq

speeq is a headless voice and text assistant for web apps. You supply the interface, routes, tools and data. The server runs in your backend, calls your model and stores conversation history in your database. An optional platform receives anonymous usage counters.

The SDK is pre-1.0. The release script publishes prereleases under the `next` tag.

| Package                                                          | Purpose                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| [core](packages/core)                                            | Protocol schemas, errors and adapter contracts          |
| [server](packages/server)                                        | Fetch handler, tool loop, confirmations and audit       |
| [client](packages/client)                                        | Browser state, streaming and speech                     |
| [react](packages/react)                                          | Provider and conversation and audit hooks               |
| [testing](packages/testing)                                      | Mock providers, speech doubles and store contract suite |
| [llm-openai-compatible](packages/adapters/llm-openai-compatible) | Streaming chat-completions adapter                      |
| [llm-gemini](packages/adapters/llm-gemini)                       | Streaming Gemini adapter                                |
| [store-memory](packages/adapters/store-memory)                   | Local development store                                 |
| [store-mongodb](packages/adapters/store-mongodb)                 | Persistent conversation store                           |

## Quickstart

Install `npm i speeq zod`, or use `npm i speeq@next zod@4` for the pre-1.0 channel. The examples use the umbrella package. To use scoped imports instead, install `pnpm add @speeq/server@next @speeq/react@next @speeq/testing@next @speeq/store-memory@next zod@4`. In your App Router catch-all route, mount the handler:

```ts
import { createSpeeq } from "speeq/server";
import { createNextHandler } from "speeq/server/next";
import { createMemoryStore } from "speeq/store-memory";
import { createMockLLMProvider } from "speeq/testing";
const agent = { name: "Helper", instructions: "Help visitors." };
const llm = createMockLLMProvider({ rules: [], fallback: () => ({ text: "Hello!" }) });
export const { GET, POST, OPTIONS } = createNextHandler(
  createSpeeq({ agent, llm, store: createMemoryStore(), secret: process.env.SPEEQ_SECRET }),
);
```

Wrap your layout children in `<SpeeqProvider endpoint="/api/speeq">`. Inside a client component, call `useSpeeq().sendText` from a button and render `messages` from the same hook. [Complete Next.js example](docs/guides/nextjs.md) · [Integration prompt for AI coding assistants](docs/integration/nextjs-integration-prompt.md)

The documentation website lives in [apps/docs](apps/docs) and deploys to Vercel on its own.

## Platform dashboard

Explore SDK installs, project attribution, feature usage and reliability in the password-protected dashboard. [Platform setup and sample data](docs/guides/platform.md)

## Try the demo

Run `pnpm install` and `pnpm dev` from the repo root. Open port 3000 and ask Vidya to show pricing. Mock mode needs no keys. The telemetry platform starts on port 3001. [Demo instructions](apps/demo/README.md)

[Architecture](ARCHITECTURE.md) · [Documentation index](llms.txt) · [Security policy](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

# @speeq/store-memory

An in-memory `ConversationStore` for [speeq](../../../README.md). Use it to try speeq locally and
in tests.

> **Not for production or serverless.** Data is lost when the process restarts, and serverless
> platforms (Vercel, Netlify, Lambda) run many short-lived instances that do not share memory, so
> sessions, history and confirmations would randomly disappear. Use
> [`@speeq/store-mongodb`](../store-mongodb) or write your own adapter.

```bash
pnpm add @speeq/store-memory
```

```ts
import { createMemoryStore } from "@speeq/store-memory";

// Keep one instance across Next.js dev hot reloads:
const g = globalThis as { speeqStore?: ReturnType<typeof createMemoryStore> };
export const store = (g.speeqStore ??= createMemoryStore());
```

It passes the shared store contract (`@speeq/testing/store-contract`).

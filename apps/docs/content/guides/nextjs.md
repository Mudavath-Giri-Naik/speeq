---

title: Add speeq to Next.js
description: The full Next.js setup in plain steps, with the server, the browser parts, and page context.
---

# Add speeq to Next.js

**What you will learn:** how each part of the Next.js setup works, and where to change it for your app. If you have not done it yet, follow the [Quickstart](/docs/quickstart) first.

## The two halves

An assistant has two halves that talk to each other:

1. **The server half** is a route in `app/api/speeq/`. It holds the model, your tools, and the conversation history.
2. **The browser half** is a provider and a few hooks. It sends what the visitor says and shows what comes back.

They talk over normal HTTP. The answer streams back a few words at a time, so the page can show text as it appears.

## The server half

```ts title="app/api/speeq/[[...speeq]]/route.ts"
import { createSpeeq } from "speeq/server";
import { createNextHandler } from "speeq/server/next";
import { createMemoryStore } from "speeq/store-memory";
import { createMockLLMProvider } from "speeq/testing";
import { after } from "next/server";

export const runtime = "nodejs";
const assistant = createSpeeq({
  secret: process.env.SPEEQ_SECRET,
  agent: { name: "Helper", instructions: "Help visitors find their way." },
  store: createMemoryStore(),
  llm: createMockLLMProvider({
    rules: [{ match: /hello/, respond: () => ({ text: "Hello from Helper." }) }],
  }),
  waitUntil: (work) => after(() => work),
});
export const { GET, POST, OPTIONS } = createNextHandler(assistant);
```

A few things to know:

- The file name `[[...speeq]]` means "match any path under `/api/speeq`". speeq uses paths like `/session` and `/health` inside it.
- Create the assistant **once**, at the top of the file. Do not create it inside a function.
- `waitUntil` lets small background jobs finish after the answer is sent. Next.js calls this `after`.
- `runtime = "nodejs"` keeps it on the Node.js runtime.

## The browser half

The provider goes around your whole app, usually in the layout. It needs the same path as your route.

```tsx
return (
  <SpeeqProvider
    endpoint="/api/speeq"
    speakReplies={false}
    onNavigate={({ href }) => router.push(href)}
  >
    {children}
  </SpeeqProvider>
);
```

- `endpoint` is where your server route lives.
- `speakReplies={false}` keeps replies silent. Remove it if you want the browser to read answers aloud.
- `onNavigate` runs when the assistant decides to open a page. You decide how, usually with the Next.js router.

## Tell the assistant where the visitor is

Use `useSpeeqContext` in any client component to share facts about the current page:

```tsx
useSpeeqContext({ page: "welcome" });
```

The next message the visitor sends includes this. Only share data that the visitor is allowed to share with the assistant.

## Next steps

- [Open pages (routes)](/docs/guides/routes)
- [Let it do things (tools)](/docs/guides/tools)
- [Go to production](/docs/guides/deployment)

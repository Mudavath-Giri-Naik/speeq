---

title: Quickstart
description: Add a working assistant to a Next.js app in about five minutes, with no API keys.
---

# Quickstart

**What you will build:** a "Say hello" button that talks to a small assistant running in your Next.js app. It uses a fake model, so you need no account and no API key.

You need an App Router project (a folder named `app`), TypeScript, and Node 20 or newer.

## 1. Install

```bash pm
npm i speeq@next zod
```

speeq needs `zod` version 4. The `speeq` package gives you every part under one name. The same code also works with the separate `@speeq/*` packages.

## 2. Add the server route

Create the file `app/api/speeq/[[...speeq]]/route.ts`. This is the door the browser talks to.

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

What this does, in plain words:

- `createSpeeq` builds the assistant. Keep it at the top of the file so it is created once.
- The **store** remembers the conversation. The memory store forgets everything when the server restarts. That is fine for now.
- The **llm** is the model. The mock model answers "Hello from Helper." when you say "hello".

## 3. Add the browser part

Create `app/assistant.tsx`:

```tsx title="app/assistant.tsx"
"use client";
import { SpeeqProvider, useSpeeq, useSpeeqContext } from "speeq/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function AssistantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <SpeeqProvider
      endpoint="/api/speeq"
      speakReplies={false}
      onNavigate={({ href }) => router.push(href)}
    >
      {children}
    </SpeeqProvider>
  );
}

export function Greeting() {
  useSpeeqContext({ page: "welcome" });
  const { sendText, messages, error } = useSpeeq();
  return (
    <section>
      <button onClick={() => void sendText("hello")}>Say hello</button>
      {messages.map((message) => (
        <p key={message.id}>{message.text}</p>
      ))}
      {error && <p role="alert">{error.message}</p>}
    </section>
  );
}
```

## 4. Use it in your pages

Wrap your layout, then show the button on a page.

```tsx title="app/layout.tsx"
import type { ReactNode } from "react";
import { AssistantProvider } from "./assistant";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AssistantProvider>{children}</AssistantProvider>
      </body>
    </html>
  );
}
```

```tsx title="app/page.tsx"
import { Greeting } from "./assistant";

export default function Page() {
  return (
    <main>
      <h1>Welcome</h1>
      <Greeting />
    </main>
  );
}
```

## 5. Try it

Start your app and open it in the browser. Press **Say hello**. You should see **Hello from Helper.**

> **Tip** If nothing shows up, open `/api/speeq/health` in your browser. It should return a small JSON message with `ok`. If it does not, check that the route file is in the right folder.

## Next steps

- Replace the fake model with a real one: [Connect a model](/docs/guides/models).
- Let it open pages: [Open pages (routes)](/docs/guides/routes).
- Let it look things up: [Let it do things (tools)](/docs/guides/tools).
- Before you go live: [Go to production](/docs/guides/deployment).

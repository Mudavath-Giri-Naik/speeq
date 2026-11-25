# Add an assistant to Next.js

Start with an App Router project with TypeScript and an `app` directory at the project root. Install `npm i speeq zod` (use `speeq@next` for the pre-1.0 channel). Each `speeq/*` import below also works as its corresponding `@speeq/*` import. For scoped prereleases, install `pnpm add @speeq/server@next @speeq/react@next @speeq/testing@next @speeq/store-memory@next zod@4`. For a checkout, the pack test installs these same packages from local tarballs. The following files give you a working text assistant with a deterministic mock reply and no provider credentials.

## Mount the server handler

Create `app/api/speeq/[[...speeq]]/route.ts`. Keep the instance at module scope to reuse the local store between requests. Next's `after` keeps background work alive through the end of the request.

```ts
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

## Connect the browser

Create `app/assistant.tsx`. The host router handles navigation events for any routes you register later. Page context is available to tools and the model. Include only data that visitors may share with the assistant.

```tsx
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

Wrap the layout in `app/layout.tsx`.

```tsx
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

Render the control in `app/page.tsx`.

```tsx
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

Run `pnpm exec next dev`. Open the local address and choose **Say hello**. The transcript should end with **Hello from Helper.** The memory store lasts for the life of this server process. Before production, provide a shared signing secret and durable store. [Deployment guide](deployment.md)

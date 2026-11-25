# @speeq/react

Headless conversation and audit hooks for React 18.2+ and 19.

```sh
pnpm add @speeq/react@next
```

## Next.js App Router

Mount the server handler at `/api/speeq`. Wrap the part of the app that uses conversation hooks with a client component.

```tsx
"use client";

import type { ReactNode } from "react";
import { SpeeqProvider } from "@speeq/react";
import { useRouter } from "next/navigation";

export function AppSpeeq({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <SpeeqProvider
      endpoint="/api/speeq"
      onNavigate={({ href }) => {
        const url = new URL(href, window.location.origin);
        if (url.origin === window.location.origin) {
          router.push(url.pathname + url.search + url.hash);
        }
      }}
    >
      {children}
    </SpeeqProvider>
  );
}
```

For a provider-owned client, `endpoint`, `languages`, `language`, `speech`, `speakReplies`, `autoSendOnFinal`, `persistSession`, and `fetch` are read once. The provider calls the latest `onNavigate` and `getContext`. Pass `client` to use an existing client with its own options and lifecycle.

Server rendering and hydration use a stable initial snapshot with speech unavailable. After hydration, the hooks read the live snapshot, including browser speech support.

## Conversation hooks

| Field                                                                                      | Use                                                                |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `state`                                                                                    | Render idle, listening, thinking, speaking, or error feedback.     |
| `messages`, `interimTranscript`                                                            | Show conversation history and live or staged transcription.        |
| `pendingConfirmation`                                                                      | Show the proposed action and let the user approve or decline.      |
| `error`, `activeTools`                                                                     | Show the current error and running tools.                          |
| `language`, `languages`, `support`                                                         | Render language choices and speech controls.                       |
| `sessionId`, `config`, `client`                                                            | Access the session ID, server configuration, or underlying client. |
| `sendText`, `startListening`, `stopListening`, `cancel`, `setLanguage`, `confirm`, `speak` | Stable actions for the current client.                             |

```tsx
import { useSpeeq, useSpeeqContext, useSpeeqEvent } from "@speeq/react";

export function QuestionHelp({ questionId }: { questionId: string }) {
  useSpeeqContext({ questionId });
  useSpeeqEvent("navigate", ({ routeId }) => console.info("Opened", routeId));
  const { sendText } = useSpeeq();

  return <button onClick={() => void sendText("Explain this question")}>Get help</button>;
}
```

Mounted `useSpeeqContext` calls contribute fields to `context.data`. Later registrations take precedence for overlapping fields. `useSpeeqEvent` calls the current handler without resubscribing when only that handler changes.

## Audit hooks

Use the hooks in a protected admin page with server-side `audit.authorize` configured. The audit hooks work independently of `SpeeqProvider` and send cookies by default.

```tsx
import { useState } from "react";
import { useAuditSession, useAuditSessions } from "@speeq/react";

export function AuditPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const options = { endpoint: "/api/speeq" };
  const list = useAuditSessions({ ...options, filter: { limit: 25 } });
  const detail = useAuditSession(selected, options);

  return (
    <>
      <p>{list.error?.message ?? detail.error?.message}</p>
      <button onClick={list.refresh}>Refresh sessions</button>
      <ul>
        {list.sessions.map(({ id, preview }) => (
          <li key={id}>
            <button onClick={() => setSelected(id)}>{preview ?? id}</button>
          </li>
        ))}
      </ul>
      <button onClick={list.loadMore} disabled={list.loading || !list.hasMore}>
        Load more
      </button>
      <ol>
        {detail.events.map((event) => (
          <li key={event.id}>{event.type}</li>
        ))}
      </ol>
    </>
  );
}
```

Use `useSpeeqAudit` to make direct audit calls from your own hooks. It memoizes by endpoint and credentials. Fetch and headers are captured when that client is created.

[Related guide or reference](../../docs/reference/react.md)

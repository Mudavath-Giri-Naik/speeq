---

title: React hooks
description: The provider and hooks from speeq/react.
---

# React hooks

Import these from `speeq/react`. Use them in client components (files that start with `"use client"`).

## SpeeqProvider

Wrap your app in it. It takes `children` and the same options as the [browser client](/docs/reference/client), and `endpoint` is required. You can also pass your own `client`. Then you manage its options and lifetime yourself. Otherwise the provider makes one client and cancels active work when it unmounts.

## Hooks

| Hook                            | What you get                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `useSpeeq()`                    | The live state, plus `sendText`, `startListening`, `stopListening`, `cancel`, `setLanguage`, `confirm`, `speak`, and the `client`. |
| `useSpeeqEvent(event, handler)` | Listens to one client event while the component is mounted.                                                                        |
| `useSpeeqContext(data)`         | Shares page data with the assistant. Later registrations win.                                                                      |
| `useSpeeqAudit(options)`        | An audit client with `listSessions` and `getSession`.                                                                              |
| `useAuditSessions(options)`     | `sessions`, `loading`, `error`, `hasMore`, `loadMore`, `refresh`. Accepts an optional `filter`.                                    |
| `useAuditSession(id, options)`  | One conversation: the session, its `events`, `loading`, `error`, and `refresh`. Pass `null` for none.                              |

The conversation hooks need the provider above them. The audit hooks only need an `endpoint`, so they work on a separate admin page.

## See also

[Add speeq to Next.js](/docs/guides/nextjs) · [Build an audit viewer](/docs/guides/audit-viewer)

---

title: Browser client
description: The framework-free client that talks to your handler, for use without React.
---

# Browser client

Use this when you do not use React. Import it from `speeq/client` and call `createSpeeqClient(options)`.

## Options

| Option                            | What it does                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `endpoint`                        | **Required.** Where your handler is mounted, like `/api/speeq`.              |
| `languages`, `language`           | The available languages, and the starting one.                               |
| `onNavigate(action)`              | Runs when the assistant opens a page. Gets `routeId`, `href`, and `params`.  |
| `getContext()`                    | Returns facts about the current page: `path`, optional `title` and `data`.   |
| `fetch`                           | Replaces the fetch function (useful in tests).                               |
| `speech.input`, `speech.output`   | Your own speech adapters. `null` turns one off. The default uses Web Speech. |
| `speakReplies`, `autoSendOnFinal` | Both `true` by default.                                                      |
| `persistSession`                  | `"memory"` (default) or `"sessionStorage"` to keep the session in one tab.   |

## Methods

| Method                                 | What it does                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| `getSnapshot()`, `subscribe(listener)` | Read the current state, or watch it. `subscribe` returns a function to stop. |
| `on(event, callback)`                  | Listen to `change`, `state`, `event`, `navigate`, or `error`.                |
| `sendText(text, options?)`             | Send a message. Creates a session if needed.                                 |
| `startListening()`, `stopListening()`  | Control the microphone.                                                      |
| `setLanguage(tag)`, `speak(text)`      | Change language, or say something aloud.                                     |
| `confirm(confirmationId, approved)`    | Answer a pending approval.                                                   |
| `cancel()`, `destroy()`                | Stop current work, or clean up.                                              |

## The snapshot

The current state has: `state` (`idle`, `listening`, `thinking`, `speaking`, or `error`), `language`, `languages`, `messages`, `interimTranscript`, `pendingConfirmation`, `error`, `activeTools`, `support`, `config`, and `sessionId`.

Each message has an `id`, a `role` (`user` or `assistant`), `text`, and a `status`.

## Audit client

`createAuditClient({ endpoint })` gives you `listSessions(params?)` and `getSession(sessionId)`. Cookies are sent by default.

## See also

[React hooks](/docs/reference/react) · [Voice and languages](/docs/guides/voice)

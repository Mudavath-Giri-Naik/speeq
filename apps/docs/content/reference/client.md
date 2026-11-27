---

title: Browser client
description: The framework-free client that talks to your handler, for use without React.
---

# Browser client

Use this when you do not use React. Import it from `speeq/client` and call `createSpeeqClient(options)`.

## Options

| Option                            | What it does                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `endpoint`                        | **Required.** Where your handler is mounted, like `/api/speeq`.                                                    |
| `languages`, `language`           | The available languages, and the starting one.                                                                     |
| `onNavigate(action)`              | Runs when the assistant opens a page. Gets `routeId`, `href`, and `params`.                                        |
| `getContext()`                    | Returns facts about the current page: `path`, optional `title` and `data`.                                         |
| `fetch`                           | Replaces the fetch function (useful in tests).                                                                     |
| `speech.input`, `speech.output`   | Your own speech adapters. `null` turns one off. The default uses Web Speech.                                       |
| `speakReplies`, `autoSendOnFinal` | Both `true` by default.                                                                                            |
| `call`                            | Tuning for calls: `interruptGraceMs` (default 1000), `echoGuard` (default true), `commitAfterMs` (default 0, off). |
| `call`                            | Tuning for calls: `interruptGraceMs` (default 1000), `echoGuard` (default true), `commitAfterMs` (default 0, off). |
| `persistSession`                  | `"memory"` (default) or `"sessionStorage"` to keep the session in one tab.                                         |

## Methods

| Method                                 | What it does                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `getSnapshot()`, `subscribe(listener)` | Read the current state, or watch it. `subscribe` returns a function to stop.                                                       |
| `on(event, callback)`                  | Listen to `change`, `state`, `event`, `navigate`, or `error`.                                                                      |
| `sendText(text, options?)`             | Send a message. Creates a session if needed.                                                                                       |
| `startListening()`, `stopListening()`  | Control the microphone for one phrase.                                                                                             |
| `startCall()`, `endCall()`             | Start or end a hands-free call. See [Voice and languages](/docs/guides/voice).                                                     |
| `getMicLevel()`                        | Visitor loudness from 0 to 1 during a call, otherwise 0.                                                                           |
| `setLanguage(tag)`, `speak(text)`      | Change language, or say something aloud.                                                                                           |
| `confirm(confirmationId, approved)`    | Answer a pending approval.                                                                                                         |
| `registerUiAction(name, handler)`      | Mount browser code for a [UI action](/docs/guides/ui-actions). Returns a function that removes it. Register before the first turn. |
| `resolveUiAction(callId, approved)`    | Approve or decline `pendingUiAction`. Ignores an id that is not pending.                                                           |
| `cancel()`, `destroy()`                | Stop current work, or clean up.                                                                                                    |

## The snapshot

The current state has: `state` (`idle`, `listening`, `thinking`, `speaking`, or `error`), `language`, `languages`, `messages`, `interimTranscript`, `pendingConfirmation`, `pendingUiAction`, `call` (`active` and `interrupted`), `error`, `activeTools`, `support`, `config`, and `sessionId`.

Each message has an `id`, a `role` (`user` or `assistant`), `text`, and a `status`.

## Audit client

`createAuditClient({ endpoint })` gives you `listSessions(params?)` and `getSession(sessionId)`. Cookies are sent by default.

## See also

[React hooks](/docs/reference/react) · [Voice and languages](/docs/guides/voice)

## Voice selection

The optional `voice` object accepts `input` and `output` (each `"browser"` or `"server"`), `endpointMs` (700 by default) and `fallbackToBrowserVoice` (true by default). Explicit `speech.input` and `speech.output` take precedence. Read `snapshot.voice` for active input, output, input streaming mode and processing location. An informational note accompanies browser input fallback.

Configure `languageMode`, `preferredLanguages`, `replyLanguage`, `vocabulary` and optional `voice.keepLastUtterance`. Read `snapshot.inputLanguage`, subscribe to `languageSuggestion`, override with `setInputLanguage(tag | "auto")`, or preview a retry with `retranscribeLast(tag)`. Corrected local messages retain `rawText` when it differs. [Multilingual speech](/docs/guides/multilingual)

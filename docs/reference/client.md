# Browser client

Call `createSpeeqClient(options)` from `@speeq/client`. Pass a required `endpoint` pointing at the mounted handler. Optional `languages` and `language` select available and initial tags. `onNavigate(action)` receives a route ID, href and params. `getContext()` supplies optional path, title and data. `fetch` replaces the transport fetch function.

The default speech input/output adapters use Web Speech when available. Supply `speech.input` or `speech.output` to replace them, or null to disable them individually. `speakReplies` and `autoSendOnFinal` default to true. `persistSession` defaults to `"memory"` and can be `"sessionStorage"` for tab-scoped session credentials.

| Method                             | Behavior                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| getSnapshot(), subscribe(listener) | Read current state and subscribe to changes. Subscription returns an unsubscribe function.                     |
| on(event, callback)                | Subscribe to change (snapshot), state, event (wire event), navigate or error. Returns an unsubscribe function. |
| sendText(text, options?)           | Create a session if needed and stream a turn. Optional inputMode is text or voice.                             |
| startListening(), stopListening()  | Control recognition.                                                                                           |
| setLanguage(tag), speak(text)      | Change language or request speech output.                                                                      |
| confirm(confirmationId, approved)  | Resume a pending tool decision.                                                                                |
| cancel(), destroy()                | Interrupt current work or dispose of the client.                                                               |

The snapshot includes `state` (idle, listening, thinking, speaking or error), `language`, `languages`, `messages`, `interimTranscript`, `pendingConfirmation`, `error`, `activeTools`, `support`, `config` and `sessionId`. Each message has an ID, role, text, status and optional turn ID. Speech support includes input, output and voice availability for the current language.

`createAuditClient({ endpoint, fetch?, headers?, credentials? })` provides `listSessions(params?, signal?)` and `getSession(sessionId, signal?)`. Credentials default to include. [Vanilla client examples](../../packages/client/README.md)

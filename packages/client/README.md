# @speeq/client

A headless client for a speeq server handler. Subscribe to conversation state and connect it to your own text, microphone and navigation controls.

## Install

```sh
pnpm add @speeq/client
```

## Vanilla JavaScript

Mount the server handler at `/api/speeq`. This example uses a form with a `message` input, a separate microphone button and a transcript element.

```js
import { createSpeeqClient } from "@speeq/client";

const client = createSpeeqClient({
  endpoint: "/api/speeq",
  onNavigate({ href }) {
    const url = new URL(href, location.origin);
    if (url.origin === location.origin) location.assign(url);
  },
});

const form = document.querySelector("#chat");
const mic = document.querySelector("#microphone");
const transcript = document.querySelector("#transcript");
function render() {
  const { messages, interimTranscript, support, error } = client.getSnapshot();
  mic.disabled = !support.speechInput;
  transcript.textContent = [
    ...messages.map(({ role, text }) => role + ": " + text),
    interimTranscript,
    error?.message,
  ]
    .filter(Boolean)
    .join("\n");
}
render();
const unsubscribe = client.subscribe(render);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = form.elements.namedItem("message").value;
  void client.sendText(text);
});
mic.addEventListener("click", () => client.startListening());
```

Call `unsubscribe()` and `client.destroy()` when removing the view. For in-app navigation, use your router in `onNavigate`.

## Options

| Option            | Behavior                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`        | Required base URL of the mounted handler.                                                                                                      |
| `language`        | Initial language. Defaults to the first entry in `languages`, then `en-IN`.                                                                    |
| `languages`       | Host language choices. Session creation filters them against the server configuration and falls back to the server default language if needed. |
| `onNavigate`      | Receives `{ routeId, href, params }` when the server requests navigation.                                                                      |
| `getContext`      | Returns optional `path`, `title` and `data` overrides for the page context sent with session and turn requests.                                |
| `speech`          | Supply `input` or `output` independently. Omitted or undefined adapters use the Web Speech defaults. Set either key to `null` to disable it.   |
| `speakReplies`    | Defaults to `true`. Enables speech playback when a matching voice is available.                                                                |
| `autoSendOnFinal` | Defaults to `true`. Set to `false` to keep the final transcript in `interimTranscript` for editing before sending.                             |
| `persistSession`  | Defaults to `"memory"`. Use `"sessionStorage"` to reuse a session across page reloads in the tab.                                              |
| `fetch`           | Optional transport implementing the Fetch API. Defaults to the global fetch function.                                                          |

## Snapshot and events

`getSnapshot()` returns the same immutable snapshot until something changes. `subscribe(listener)` signals changes. Read the new snapshot inside the listener.

| Field                   | Contents                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `state`                 | Current activity shown below.                                                                                    |
| `language`, `languages` | Current language and enabled choices. Use `setLanguage(tag)` to switch.                                          |
| `messages`              | User and assistant messages with stable IDs, text and a status of `streaming`, `done`, `interrupted` or `error`. |
| `interimTranscript`     | Live recognition text, or a completed transcript awaiting manual submission.                                     |
| `pendingConfirmation`   | The proposed write action awaiting a decision, or `null`.                                                        |
| `error`                 | A public error with a code, message, retryability and optional retry delay, or `null`.                           |
| `activeTools`           | Running tools identified by call ID and name.                                                                    |
| `support`               | Input and output availability. `voiceForLanguage` is `null` before a voice check completes, then a boolean.      |
| `config`, `sessionId`   | Server configuration and session identifier, populated when a session is established.                            |

`client.on(name, callback)` returns an unsubscribe function. The `change` event carries the snapshot, `state` carries each new state, `event` carries individual protocol events, `navigate` carries a navigation action and `error` carries the public error.

```text
idle → listening → thinking → speaking → idle
idle → thinking → idle                 (text-only reply)
listening → idle                       (no speech or manual submission)
listening / thinking / speaking → error
cancel() → idle
```

A turn enters `thinking` while the client establishes the session and streams the response. With speech enabled, the first sentence can play while later text is still arriving. Sentences play in order, in the turn's language. The client returns to idle after the stream and playback finish successfully.

Start listening or send new text to interrupt an active reply. Barge-in cancels speech, aborts the turn request and marks a streaming message as interrupted. Use `stopListening()` to finish recognition and accept its transcript, or `cancel()` to discard it.

## Confirming a write

When `pendingConfirmation` is set, show its `summary` and let the user approve or decline. Capture the ID for the action displayed. In the click handler, call:

```js
await client.confirm(confirmationId, approved); // approved is the user's boolean choice
```

The client clears the prompt immediately and streams the server's follow-up. Surface any error in the snapshot, including a conflict if the decision has already been handled.

## Sessions

The first text turn, submitted voice transcript or confirmation creates a session. The client keeps the token in memory. With session storage enabled, the key is `speeq:session:<endpoint>`. If storage is unavailable, the client can still use memory. It renews a session within 30 seconds of expiry. If a turn or confirmation receives a 401 with `SESSION_EXPIRED` or `UNAUTHENTICATED`, the client creates a fresh session and retries the request once. The new server session starts with fresh history.

## Custom speech adapters

Supply objects implementing the core `SpeechInput` or `SpeechOutput` interface. Input exposes `supported`, `start(options, handlers)`, `stop()` and `abort()`. Deliver the final transcript through `handlers.onFinal`. Output exposes `supported`, `hasVoiceFor(language)`, `speak(text, options)` and `cancel()`. Resolve pending playback when it ends or is cancelled.

To keep browser recognition and customize playback, pass only the output adapter:

```js
import { createSpeeqClient, WebSpeechOutput } from "@speeq/client";

const client = createSpeeqClient({
  endpoint: "/api/speeq",
  speech: { output: new WebSpeechOutput({ rate: 0.95, pitch: 1 }) },
});
```

`selectVoice(language, voices)` can choose a device voice. Return `undefined` to use exact language matching followed by a primary-language fallback. `voicesTimeoutMs` can shorten the default 1500 ms wait for an initially empty voice list.

## Browser support

Speech recognition works best in Chrome and Edge. Firefox has no default `SpeechRecognition` support, so offer a text input. Chrome recognition uses a cloud service and needs a network connection. Microphone access requires a secure context (HTTPS or localhost) and user permission.

Some devices lack matching `te-IN` or `hi-IN` voices. When `support.voiceForLanguage` is `false`, replies stay text-only for that language. Recognition availability is tracked separately. Use `detectSpeechSupport()` to check the browser APIs, or the snapshot's support fields to account for custom adapters. React users should see `@speeq/react`.

## Audit client

Use `createAuditClient` to read session summaries and ordered event history from your own server. Configure `audit.authorize` on the server. Requests include cookies by default.

```ts
import { createAuditClient } from "@speeq/client";

const audit = createAuditClient({ endpoint: "/api/speeq" });
const { sessions, nextCursor } = await audit.listSessions({ limit: 25 });
const first = sessions[0];
if (first) {
  const { session, events } = await audit.getSession(first.id);
  console.log(session.id, events.length);
}
if (nextCursor) {
  await audit.listSessions({ limit: 25, cursor: nextCursor });
}
```

Both methods accept an abort signal and report HTTP errors as `SpeeqError`.

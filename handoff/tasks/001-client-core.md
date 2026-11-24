# TASK 001 — @speeq/client core: state machine, transport, TTS orchestration

Branch: task/001-client-core (create it from latest main)

## 1. Read first

- `AGENTS.md` (all rules apply)
- `docs/SPEC.md` §4 (turn flow, confirmation flow, HTTP + SSE protocol) and §6.3 (client). If `docs/SPEC.md` is missing, use this brief alone: it is complete.
- Protocol types: `packages/core/src/schemas/protocol.ts`, `packages/core/src/schemas/http.ts`, `packages/core/src/errors.ts` (`PublicError`, `SpeeqError`, codes)
- Utilities you must reuse (do not reimplement): `packages/core/src/utils/` → `SseParser`, `SentenceChunker`, `TypedEmitter`, `createId`
- Speech interfaces: `packages/core/src/interfaces/speech.ts`
- Server behavior you talk to: `packages/server/src/handler/index.ts`, `handler/turn.ts`, `handler/session.ts`
- Fakes: `packages/testing/src/fake-speech.ts`, `fake-llm.ts`, `http.ts`
- Package template: `packages/adapters/store-memory/` (package.json shape, tsconfig, vitest config)

## 2. Goal

Create `@speeq/client`: a framework-agnostic browser client with **zero runtime dependencies**. It manages the session, sends turns, parses the SSE stream, keeps an immutable snapshot for UIs, speaks replies sentence by sentence through a `SpeechOutput`, listens through a `SpeechInput`, supports barge-in, and calls `onNavigate`. This task uses the speech **interfaces** only. The concrete Web Speech adapters come in task 002.

## 3. Decisions already made (do NOT change or re-decide)

1. **Zero runtime deps.** `package.json` has no `dependencies` and no `peerDependencies`. Runtime imports are allowed only from `@speeq/core/errors` and `@speeq/core/utils`. Type imports (`import type`) from `@speeq/core` are allowed. tsup bundles them: `noExternal: [/^@speeq\/core/]`, and the `.d.ts` must inline core types (`dts: { resolve: [/^@speeq\/core/] }`). The built `dist/*.js` must not contain the strings `@speeq/core` or `zod`. devDependencies may include `@speeq/core`, `@speeq/testing`, `@speeq/server`, `@speeq/store-memory`, `zod`.
2. **No zod at runtime.** Validate incoming SSE events with a light structural check: an object, `protocolVersion === 1`, and `typeof type === "string"`. Ignore anything else, including unknown event types (forward compatible) and events whose JSON fails to parse.
3. **States** are exactly `"idle" | "listening" | "thinking" | "speaking" | "error"`. The transition rules are in §5. There is no "connecting" state: session creation counts as `thinking`.
4. **One request per turn.** `POST {endpoint}/session/{id}/turn` with `Authorization: Bearer <token>`, `content-type: application/json`, `accept: text/event-stream`. The stream is read through `fetch` + `response.body.getReader()` + `TextDecoder` (stream mode) + `SseParser`. There is no EventSource and no reconnect.
5. **Session.** Created lazily on the first `sendText`/`confirm` via `POST {endpoint}/session` with body `{ language, context }`. The token is kept in memory. With `persistSession: "sessionStorage"`, also store `{sessionId, sessionToken, expiresAt, config}` under the key `speeq:session:<endpoint>`. Every access is wrapped in try/catch, and a corrupt value is ignored. A session counts as expired 30 s before `expiresAt`, and a new one is created before the turn.
6. **Token refresh.** If the turn or confirm request returns HTTP 401 with error code `SESSION_EXPIRED` or `UNAUTHENTICATED`, drop the session, create a new one, and retry **once** with the same body. A second failure becomes an error. (Server history is lost with the new session. That is accepted.)
7. **Barge-in.** `startListening()` cancels current speech (`output.cancel()`) and aborts any in-flight turn request before it starts recognition. `sendText()` while a turn or speech is active does the same (cancel, then send).
8. **TTS.** Speak only when `speakReplies !== false`, `output.supported`, and `await output.hasVoiceFor(language)` is true (cache the result per language). Feed every `assistant.delta` into a `SentenceChunker` and enqueue each completed sentence. On `assistant.message`, enqueue the chunker's `flush()` remainder, then start a fresh chunker for the next message in the same turn. Sentences are spoken strictly in order, one `speak()` at a time, with the language captured at turn start. A **generation counter** makes `cancel()`, barge-in and new turns ignore stale `speak()` resolutions.
9. **Messages.** A user message is added locally when sent. An assistant message is created on the first delta after the turn starts, or after a previous `assistant.message`. On `assistant.message`, its text is replaced by the event's authoritative `text` and its status becomes `done`. A multi-step turn can therefore produce several assistant messages.
10. **Navigation.** On a `navigate` event, call `options.onNavigate({ routeId, href, params })` right away and emit the `navigate` client event. Errors thrown by `onNavigate` are caught and reported with `console.error`. They never break the stream.
11. **Client-side errors** use the existing codes (no new codes). Network failure → `{ code: "INTERNAL", message: "Could not reach the assistant. Check your connection.", retryable: true }`. Stream ended without `turn.finished` → `{ code: "INTERNAL", message: "The connection was interrupted.", retryable: true }`. Voice not supported → `{ code: "NOT_CONFIGURED", message: "Voice input is not supported in this browser. Please type instead.", retryable: false }`. Mic denied → `{ code: "FORBIDDEN", message: "Microphone permission was denied.", retryable: false }`. A non-2xx JSON error body `{ error: PublicError }` is used as-is. A non-JSON error body → `{ code: "INTERNAL", message: "Something went wrong.", retryable: true }`.
12. **SSR safety.** Importing and constructing the client must work in Node with no `window`/`document`/`sessionStorage`. Every browser global access is guarded with `typeof … !== "undefined"`.
13. **Snapshot** objects are immutable. Create a new object on every change and return the **same reference** from `getSnapshot()` while nothing has changed (required by `useSyncExternalStore`). `messages` and the other arrays are new arrays when they change.

## 4. Scope

Create:

- `packages/client/package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `README.md` (short: install, minimal example, link to task 002 adapters "coming soon")
- `packages/client/src/index.ts` (public exports only)
- `packages/client/src/types.ts` (the contract types in §6)
- `packages/client/src/client.ts` (createSpeeqClient + state machine)
- `packages/client/src/session.ts` (session create/persist/expiry/refresh)
- `packages/client/src/stream.ts` (POST + SSE reading → protocol events async iterator)
- `packages/client/src/speech-queue.ts` (ordered TTS queue with generation counter)
- `packages/client/src/context.ts` (page context collection)
- `packages/client/test/*.test.ts`

Modify:

- `handoff/INDEX.md` (set 001 to `in-progress` at start; do not mark accepted)

Do NOT touch: anything under `packages/core`, `packages/server`, `packages/testing`, adapters, `scripts/`, root configs. If you believe core needs a change, record it in the report instead.

## 5. Requirements (numbered, each testable)

1. `createSpeeqClient(options)` returns a `SpeeqClient` (see §6) without network calls or browser access.
2. Initial snapshot: `state "idle"`, `language = options.language ?? options.languages?.[0] ?? "en-IN"`, `languages = options.languages ?? [language]`, empty `messages`, `interimTranscript ""`, `pendingConfirmation null`, `error null`, `config null`, `sessionId null`, `activeTools []`, `support = { speechInput: !!input?.supported, speechOutput: !!output?.supported, voiceForLanguage: null }`.
3. After a session is created, `config` is set. `languages` becomes `options.languages` filtered to `config.languages` if `options.languages` was given, otherwise `config.languages`. If the current language is not in the result, switch to `config.defaultLanguage`.
4. `sendText(text, { inputMode })`: trims the text, and an empty string is a no-op. Clears `error`, cancels any active turn and speech (decision 7), appends the user message, sets `state "thinking"`, ensures a session, and POSTs `{ text, language, context, inputMode }`. `inputMode` defaults to `"text"`.
5. Stream handling: `assistant.delta` appends text (creating the message as in decision 9). `assistant.message` finalizes it. `tool.started`/`tool.finished` add and remove entries in `activeTools` by `callId`. `navigate` triggers decision 10. `confirmation.required` sets `pendingConfirmation`. `error` sets `snapshot.error` (and any streaming assistant message gets status `"error"`). `turn.finished` ends the turn. Every valid protocol event is also emitted as the client event `"event"`.
6. State transitions during a turn: `thinking` until the first `speak()` actually starts, then `speaking`. When the stream has ended **and** the speech queue is empty: `error` if an error event or error occurred, else `idle`. If there is no TTS, go straight from `thinking` to `idle`/`error` at the end of the stream.
7. `startListening()`: if there is no input or `!input.supported`, set the decision-11 "not supported" error and state `error`, then return. Otherwise apply barge-in, clear `error`, set `state "listening"`, and call `input.start({ language, interimResults: true }, handlers)`. `onInterim` sets `interimTranscript`. `onFinal(t)` clears `interimTranscript` and calls `sendText(t, { inputMode: "voice" })` unless `autoSendOnFinal === false` (then it just stores `interimTranscript = t` and returns to idle). `onError`: `"no-speech"`/`"aborted"` → idle with no error; `"not-allowed"` → decision-11 mic error, state `error`; others → `{ code: "INTERNAL", message: "Voice input failed. Please try again.", retryable: true }`. `onEnd` with no final transcript → `idle` (only if still `listening`).
8. `stopListening()` calls `input.stop()`. The final transcript arrives through `onFinal`.
9. `cancel()` aborts the in-flight request, calls `input.abort()` (if listening) and `output.cancel()`, and bumps the speech generation. Any streaming assistant message gets status `"interrupted"`, and the state becomes `idle`. No error is shown for a user-initiated abort.
10. `confirm(confirmationId, approved)`: clears `pendingConfirmation` right away, sets `thinking`, POSTs `{ confirmationId, approved }` to `/session/{id}/confirm`, and handles the stream exactly like a turn. HTTP 404/409 errors land in `snapshot.error` with state `error`.
11. `setLanguage(lang)`: if `lang` is not in `snapshot.languages`, it throws `new SpeeqError("INVALID_INPUT", { message: "Language not enabled: <lang>" })`. Otherwise it aborts listening if active, updates `language`, sets `support.voiceForLanguage` to `null` and then to the result of `output.hasVoiceFor(lang)` (when output exists).
12. `speak(text)`: if TTS is possible (decision 8), sets `speaking` and resolves after speech; then `idle`. If not possible, it resolves immediately with no state change.
13. `subscribe(listener)` calls the listener on every snapshot change and returns an unsubscribe function. `on(event, cb)` uses `TypedEmitter`. `destroy()` cancels everything and removes all listeners. Later calls are no-ops.
14. Context: each turn and session request sends `context = { path, title, data }`. `path` = `location.pathname + location.search`, `title` = `document.title` (both only when defined), and `getContext()` (if given) is shallow-merged on top, so it can override `path`/`title` or add `data`. If `getContext` throws, the auto context is used and the error is logged with `console.error`. The final object is omitted when it has no `path`.
15. `fetch` option is used for every request (default `globalThis.fetch`); the endpoint is normalized without trailing slash.
16. Public API has JSDoc on every export.

## 6. Contracts (must match exactly)

```ts
import type { ClientConfig, ProtocolEvent, SpeechInput, SpeechOutput } from "@speeq/core";
import type { PublicError } from "@speeq/core/errors";

export type SpeeqState = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface ChatMessage {
  id: string; // createId("msg") for local ids
  role: "user" | "assistant";
  text: string;
  status: "streaming" | "done" | "interrupted" | "error";
  turnId?: string;
}

export interface PendingConfirmation {
  confirmationId: string;
  toolName: string;
  summary: string;
  args: unknown;
}

export interface NavigateAction {
  routeId: string;
  href: string;
  params: Record<string, unknown>;
}

export interface PageContextInput {
  path?: string;
  title?: string;
  data?: Record<string, unknown>;
}

export interface SpeeqSnapshot {
  state: SpeeqState;
  language: string;
  languages: string[];
  messages: ChatMessage[];
  interimTranscript: string;
  pendingConfirmation: PendingConfirmation | null;
  error: PublicError | null;
  activeTools: Array<{ callId: string; name: string }>;
  support: { speechInput: boolean; speechOutput: boolean; voiceForLanguage: boolean | null };
  config: ClientConfig | null;
  sessionId: string | null;
}

export interface SpeeqClientOptions {
  /** Base URL of the mounted handler, e.g. "/api/speeq". */
  endpoint: string;
  languages?: string[];
  language?: string;
  onNavigate?: (action: NavigateAction) => void;
  getContext?: () => PageContextInput | undefined;
  /** Omit or pass null to disable. (Task 002 adds Web Speech defaults.) */
  speech?: { input?: SpeechInput | null; output?: SpeechOutput | null };
  /** Speak assistant replies when possible. Default true. */
  speakReplies?: boolean;
  /** Send the final voice transcript automatically. Default true. */
  autoSendOnFinal?: boolean;
  /** Default "memory". */
  persistSession?: "memory" | "sessionStorage";
  fetch?: typeof fetch;
}

export interface SpeeqClientEvents {
  change: SpeeqSnapshot;
  state: SpeeqState; // emitted only when state actually changes
  event: ProtocolEvent; // every valid protocol event received
  navigate: NavigateAction;
  error: PublicError; // every time snapshot.error becomes non-null
}

export interface SpeeqClient {
  getSnapshot(): SpeeqSnapshot;
  subscribe(listener: () => void): () => void;
  on<K extends keyof SpeeqClientEvents>(
    event: K,
    cb: (payload: SpeeqClientEvents[K]) => void,
  ): () => void;
  sendText(text: string, options?: { inputMode?: "text" | "voice" }): Promise<void>;
  startListening(): void;
  stopListening(): void;
  cancel(): void;
  setLanguage(language: string): void;
  confirm(confirmationId: string, approved: boolean): Promise<void>;
  speak(text: string): Promise<void>;
  destroy(): void;
}

export function createSpeeqClient(options: SpeeqClientOptions): SpeeqClient;
```
`sendText` and `confirm` never reject because of server, network or stream errors: those go into `snapshot.error`. They reject only on programming errors.

## 7. Tests required

Use `FakeSpeechInput` / `FakeSpeechOutput` from `@speeq/testing`. Write **both** kinds:

- (a) **unit tests** with a hand-built fake `fetch` returning SSE `Response`s split into tiny chunks (use `encodeSse` from `@speeq/core/utils` in tests only)
- (b) **integration tests** where `fetch` calls a real `createSpeeq(...)` handler from `@speeq/server` with `FakeLLMProvider` and `createMemoryStore` (`fetch: (url, init) => speeq.handler(new Request(new URL(String(url), "http://localhost"), init))`)

Cover:

1. Initial snapshot (req 2); construction works with no `window` (Node test env).
2. Snapshot reference is stable when nothing changed, and new after a change.
3. Text turn: user message, streamed deltas, final message `done`, `thinking → idle`, `event` emitted per protocol event.
4. Multi-step turn producing two assistant messages.
5. Navigation: `onNavigate` called once with `{routeId, href, params}`. A throwing `onNavigate` does not break the turn.
6. Confirmation: `pendingConfirmation` is set. `confirm(id, true)` clears it and streams the follow-up (integration test with a write tool). `confirm` replay → `snapshot.error.code === "CONFLICT"`.
7. Errors: server `error` event (e.g. a FakeLLM `RATE_LIMITED`) → `snapshot.error` with `retryAfterMs`, state `error`. Non-2xx JSON error. Non-JSON error body. Network failure (`fetch` throws). Stream ending without `turn.finished` → "interrupted" error. Unknown event types and invalid JSON lines are ignored.
8. Token refresh: the first turn gets 401 `SESSION_EXPIRED` → exactly one new session and one retry. A second 401 → error with no infinite loop. An expired `expiresAt` → a new session is created **before** the turn.
9. `persistSession: "sessionStorage"` with a stubbed `globalThis.sessionStorage`: session reused across two client instances. A corrupt stored value is ignored. A throwing storage does not break the client.
10. TTS: sentences spoken in order while the stream continues (assert `FakeSpeechOutput.spoken` order). State `speaking` while speech runs, then `idle`. No speech when `speakReplies: false`, when `output.supported === false`, or when `hasVoiceFor` is false. Language passed to `speak` is the turn's language.
11. Barge-in: `startListening()` during speech calls `output.cancel()`, aborts the request, and stale speech completions do not change the state afterwards. `sendText` during an active turn cancels the previous one (its assistant message becomes `interrupted`).
12. Listening: interim → `interimTranscript`; final → auto `sendText` with `inputMode "voice"` (assert the request body). `autoSendOnFinal: false`. `no-speech` → idle without error. `not-allowed` → FORBIDDEN error. Unsupported input → NOT_CONFIGURED error.
13. `cancel()` → `idle`, message `interrupted`, no error.
14. `setLanguage`: invalid → throws INVALID_INPUT. Valid → updates `voiceForLanguage` from `hasVoiceFor`. Server config filtering of `languages` (req 3).
15. Context: `getContext` merge and override; a throwing `getContext` falls back; `context` omitted without path.
16. `destroy()` stops everything; later calls are no-ops.

## 8. Acceptance

- `scripts/verify.sh` passes (all existing tests still pass).
- `pnpm --filter @speeq/client build`, then confirm `dist/index.js` and `dist/index.cjs` do not contain `@speeq/core` or `zod`, and `dist/index.d.ts` has no `from "@speeq/core` import. Report the result of this check.
- `package.json` has no `dependencies`/`peerDependencies` (the dependency-direction check in `pnpm lint` enforces this).
- Built ESM bundle size (`dist/index.js`) is reported in the report.

## 9. Finish

Commit on the branch (Conventional Commits, e.g. `feat(client): add state machine, transport and TTS orchestration`, no attribution). Write `handoff/reports/001-client-core.md` using `handoff/REPORT_TEMPLATE.md` and print it at the end. Do not merge to main. Do not push.

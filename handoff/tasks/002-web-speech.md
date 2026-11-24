# TASK 002 — @speeq/client: Web Speech adapters, default speech wiring, README

Branch: task/002-web-speech (create it from latest main)

## 1. Read first

- `AGENTS.md` (all rules apply)
- `docs/SPEC.md` §3 ("Known limits"), §6.3 (if the file is missing, this brief is complete)
- `packages/core/src/interfaces/speech.ts` (`SpeechInput`, `SpeechOutput`, handler and error codes)
- `packages/client/src/client.ts`, `types.ts`, `speech-queue.ts` (task 001, already merged)
- `packages/testing/src/fake-speech.ts` (reference behavior of the interfaces)

## 2. Goal

Add the browser defaults: `WebSpeechInput` (Web Speech `SpeechRecognition`) and `WebSpeechOutput` (`speechSynthesis`). `createSpeeqClient` uses them automatically when `speech` is not given, and everything stays SSR-safe. Write the full `@speeq/client` README.

## 3. Decisions already made (do NOT change or re-decide)

1. **No new dependencies** and no `@types/*` packages. Declare minimal local TypeScript interfaces for `SpeechRecognition`, its events and `SpeechSynthesis*` in `src/web-speech-types.ts` (do not augment globals). Access browser globals only through `globalThis` with `typeof` guards.
2. **SSR-safe and lazy.** Constructors must not touch any browser global. `supported` is a **getter** evaluated on each access. In Node (no globals), `supported === false` and nothing throws.
3. **Recognition constructor lookup:** `globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition`.
4. **`WebSpeechInput.start`** creates a **new** recognition instance for every call, with `lang = options.language`, `interimResults = options.interimResults ?? true`, `continuous = false`, `maxAlternatives = 1`. If one is already active, `abort()` it first (no `onFinal` for the old one).
   - `onresult`: concatenate final results (`isFinal`) into a final buffer, and concatenate the current non-final results into `interim` → `onInterim(interim)` when it is non-empty and changed.
   - **`onFinal` is delivered once, at `onend`**, if the trimmed final buffer is non-empty and the session was not aborted. Then `onEnd()` is called. `onEnd` is always called exactly once per `start`.
   - `stop()` → `recognition.stop()` (the final transcript is then delivered at `onend`). `abort()` → mark aborted, `recognition.abort()`, so `onFinal` is not called.
   - Error mapping (`event.error` → interface code): `not-allowed` and `service-not-allowed` → `not-allowed`; `no-speech` → `no-speech`; `network` → `network`; `aborted` → `aborted`; `language-not-supported` → `unsupported`; anything else → `other`. The `message` is `event.message || event.error`. If `start()` throws, or no constructor exists, call `onError({ code: "unsupported", … })`, then `onEnd()`.
5. **`WebSpeechOutput`**
   - `supported` = `speechSynthesis` and `SpeechSynthesisUtterance` both exist.
   - Voices: `speechSynthesis.getVoices()`. If it returns an empty list, wait for the `voiceschanged` event, **at most 1500 ms**, then read again. Share the in-flight wait across calls. Re-read the list on every lookup after it has loaded (devices can add voices).
   - Voice matching for a BCP 47 tag (normalize `_` → `-`, ignore case): (1) an exact `voice.lang` match, preferring `voice.default`, then `localService`; (2) the same primary subtag (e.g. `te`); (3) none.
   - `hasVoiceFor(lang)` → true if the matching returns a voice. Unsupported → false.
   - `speak(text, { language, signal })`: create an utterance with `lang = language`, `voice` = the matched voice (if any), `rate`/`pitch` from the options. If `speechSynthesis.paused`, call `resume()` first. Resolve on `end` **or** `error` (never reject). If the signal is already aborted, resolve immediately without speaking. If it aborts later, call `cancel()`.
   - `cancel()` → `speechSynthesis.cancel()` and resolve every pending `speak` promise.
6. **Default wiring in `createSpeeqClient`:** `speech === undefined` → `{ input: new WebSpeechInput(), output: new WebSpeechOutput() }`. Within a given `speech` object, a key that is `undefined` gets its default and a key that is `null` disables it. Update the `speech` JSDoc in `types.ts` to say this.
7. **Initial voice check:** after construction, if `output?.supported`, the client asynchronously runs `hasVoiceFor(initial language)` and sets `support.voiceForLanguage`. It must not run during SSR, where `supported` is false, so it is skipped automatically. Use the same per-language cache as task 001.
8. Public exports added to `packages/client/src/index.ts`: `WebSpeechInput`, `WebSpeechOutput`, `WebSpeechOutputOptions`, `detectSpeechSupport`.

## 4. Scope

Create:

- `packages/client/src/web-speech-types.ts`
- `packages/client/src/web-speech-input.ts`
- `packages/client/src/web-speech-output.ts`
- `packages/client/test/web-speech-input.test.ts`
- `packages/client/test/web-speech-output.test.ts`
- `packages/client/test/defaults.test.ts`

Modify:

- `packages/client/src/client.ts` (default wiring + initial voice check only)
- `packages/client/src/types.ts` (JSDoc of `speech` only)
- `packages/client/src/index.ts` (exports)
- `packages/client/README.md` (full rewrite, see requirement 7)
- `handoff/INDEX.md` (add row 002 `in-progress` at start)

Do NOT touch: anything outside `packages/client/` except `handoff/`. Do not change the task-001 contracts in `types.ts` (other than the JSDoc above).

## 5. Requirements

1. `WebSpeechInput` and `WebSpeechOutput` implement the core interfaces exactly as described in decisions 3–5.
2. `detectSpeechSupport(): { input: boolean; output: boolean }` uses the same checks. It is safe on the server.
3. Default wiring and initial voice check per decisions 6–7.
4. No browser global is touched at import or construction time (tested by importing and constructing in Node).
5. Every public export has JSDoc.
6. Existing task-001 tests still pass unchanged. If one must change because of the defaults (e.g. it relied on `speech` being undefined → none), pass `speech: { input: null, output: null }` explicitly in that test and mention it in the report.
7. README covers: install; a minimal vanilla example (`createSpeeqClient`, `subscribe`, `sendText`, `startListening`, `onNavigate`); an options table; the snapshot fields; client events; the state machine (a small text diagram); barge-in and sentence-by-sentence speech; the confirmation flow (`pendingConfirmation` → `confirm`); session persistence and token refresh; custom speech adapters (implement `SpeechInput`/`SpeechOutput`); and a **"Browser support"** section. That section says: speech recognition works best in Chrome and Edge, Firefox has no `SpeechRecognition` (use text input), recognition in Chrome uses a cloud service so it needs a network connection, `te-IN`/`hi-IN` voices may not exist on some devices (then the client stays text-only for that language via `support.voiceForLanguage`), the page needs a secure context (https or localhost) for the microphone, and React users should see `@speeq/react`. Keep it accurate to the code. Do not promise behavior the code does not have.

## 6. Contracts

```ts
export class WebSpeechInput implements SpeechInput {
  get supported(): boolean;
  start(options: SpeechInputOptions, handlers: SpeechInputHandlers): void;
  stop(): void;
  abort(): void;
}

export interface WebSpeechOutputOptions {
  /** Default 1. */
  rate?: number;
  /** Default 1. */
  pitch?: number;
  /** Override voice choice. Return undefined to fall back to the built-in matching. */
  selectVoice?: (language: string, voices: readonly SpeechSynthesisVoiceLike[]) => SpeechSynthesisVoiceLike | undefined;
  /** Max wait for `voiceschanged` when the voice list is empty. Default 1500 ms. */
  voicesTimeoutMs?: number;
}

export class WebSpeechOutput implements SpeechOutput {
  constructor(options?: WebSpeechOutputOptions);
  get supported(): boolean;
  hasVoiceFor(language: string): Promise<boolean>;
  speak(text: string, options: SpeakOptions): Promise<void>;
  cancel(): void;
}

export function detectSpeechSupport(): { input: boolean; output: boolean };
```

`SpeechSynthesisVoiceLike` (exported from `web-speech-types.ts`) = `{ name: string; lang: string; default: boolean; localService: boolean; voiceURI: string }`.

## 7. Tests required

Stub globals on `globalThis` in each test (and restore them afterwards) with small fake classes. Do not use jsdom/happy-dom.

Input:

1. Detection via `SpeechRecognition` and via `webkitSpeechRecognition`. Neither → `supported` false, and `start` gives `onError("unsupported")` + `onEnd`.
2. Interim results → `onInterim` with the concatenated non-final text, not repeated when unchanged.
3. Final results across two result events are delivered once as a single trimmed `onFinal` at `onend`, followed by `onEnd`.
4. `stop()` calls `recognition.stop()`, and the final transcript is still delivered. `abort()` → no `onFinal`, but `onEnd` is still called once.
5. Error mapping table (every row in decision 4), then `onEnd` once.
6. `start` while active aborts the previous instance (the previous instance gets no `onFinal`), and the new instance uses the new language.
7. A `start()` that throws → `unsupported` + `onEnd`.

Output:

8. `supported` true/false. `hasVoiceFor` with exact match, primary-subtag match (`te` voice for `te-IN`), no match (`hi-IN` with only English voices → false), and `_` normalization (`en_IN`).
9. Empty voice list then `voiceschanged` → voices found. No event → resolves false after `voicesTimeoutMs` (use fake timers or a small timeout).
10. `speak` sets `lang`, the voice, rate and pitch, and resolves on `end`. It also resolves on `error`. `resume()` is called when paused.
11. `cancel()` resolves pending speaks. An already-aborted signal → resolves without speaking. Aborting mid-speech → `cancel` is called.
12. `selectVoice` override is used; returning undefined falls back.

Defaults:

13. In Node with no globals, `createSpeeqClient({ endpoint })` constructs, `support` is all false, and `startListening()` gives the NOT_CONFIGURED error (no throw).
14. With stubbed globals: the defaults are the Web adapters (`support.speechInput/speechOutput` true), and `voiceForLanguage` becomes true or false after the initial async check.
15. `speech: { input: null }` disables input only. `speech: { output: myFake }` keeps the default input.

## 8. Acceptance

- `scripts/verify.sh` passes.
- `pnpm --filter @speeq/client build`: `dist/index.js`/`.cjs` still contain no `@speeq/core` or `zod`. Report the new ESM bundle size.
- Package `dependencies`/`peerDependencies` are still empty.

## 9. Finish

Commit on the branch (Conventional Commits, e.g. `feat(client): add Web Speech input and output adapters`, no attribution). Write `handoff/reports/002-web-speech.md` using `handoff/REPORT_TEMPLATE.md` and print it at the end. Do not merge to main. Do not push.

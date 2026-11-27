# speeq

## 0.8.0

### Minor Changes

- 07c2699: New `npx speeq connect` (also offered at the end of `init`): paste your model key in the terminal (hidden), speeq checks it with the provider, tests which chat models work, lets you pick one, and saves the key and model in `.env.local`. It also offers to switch `speeq.config.ts` when it still uses a different provider than the key you pasted. Keys go only to the provider's own host and are never printed.

### Patch Changes

- Updated dependencies [07c2699]
  - @speeq/cli@0.8.0
  - @speeq/llm-gemini@0.8.0
  - @speeq/llm-openai-compatible@0.8.0
  - @speeq/speech@0.8.0
  - @speeq/store-memory@0.8.0
  - @speeq/store-mongodb@0.8.0
  - @speeq/client@0.8.0
  - @speeq/core@0.8.0
  - @speeq/react@0.8.0
  - @speeq/server@0.8.0
  - @speeq/testing@0.8.0

## 0.7.0

### Minor Changes

- 54755b9: `npx speeq init` now sets up a working assistant without writing code: it asks for a model provider (Groq, Gemini, OpenRouter, any OpenAI-compatible server, or mock) and voice, generates the chat box into your app, adds it to your root layout, and writes the needed variable names into `.env.local` for you to fill in (it never writes or reads your keys). Also adds draft-only form filling (`defineFormFill`, `useSpeeqForm`) and generated `.speeq/generated/ui.ts`.

### Patch Changes

- Updated dependencies [54755b9]
  - @speeq/core@0.7.0
  - @speeq/server@0.7.0
  - @speeq/client@0.7.0
  - @speeq/react@0.7.0
  - @speeq/cli@0.7.0
  - @speeq/llm-gemini@0.7.0
  - @speeq/llm-openai-compatible@0.7.0
  - @speeq/speech@0.7.0
  - @speeq/store-memory@0.7.0
  - @speeq/store-mongodb@0.7.0
  - @speeq/testing@0.7.0

## 0.6.0

### Minor Changes

- d687185: Add UI actions: the agent can ask the page to run a named, developer-declared browser function. Declare it with `defineUiAction` on the server, mount it with `useSpeeqAction` in React or `client.registerUiAction`, and the user approves write actions before they run. Additive and opt-in per session through the `ui-actions` capability; sessions without it never see the new events.

### Patch Changes

- Updated dependencies [d687185]
  - @speeq/core@0.6.0
  - @speeq/server@0.6.0
  - @speeq/client@0.6.0
  - @speeq/react@0.6.0
  - @speeq/testing@0.6.0
  - @speeq/llm-gemini@0.6.0
  - @speeq/llm-openai-compatible@0.6.0
  - @speeq/speech@0.6.0
  - @speeq/store-memory@0.6.0
  - @speeq/store-mongodb@0.6.0
  - @speeq/cli@0.6.0

## 0.5.0

### Minor Changes

- 81d3a6c: Add the `speeq` command: `npx speeq init` scans a Next.js App Router app, lets you approve what the assistant may use and writes the glue code. `speeq doctor` and `speeq verify` report static, runtime and host readiness separately. The CLI, integration engine and compiler packages are now published.

### Patch Changes

- Updated dependencies [81d3a6c]
  - @speeq/cli@0.5.0
  - @speeq/llm-gemini@0.5.0
  - @speeq/llm-openai-compatible@0.5.0
  - @speeq/speech@0.5.0
  - @speeq/store-memory@0.5.0
  - @speeq/store-mongodb@0.5.0
  - @speeq/client@0.5.0
  - @speeq/core@0.5.0
  - @speeq/react@0.5.0
  - @speeq/server@0.5.0
  - @speeq/testing@0.5.0

## 0.4.0

### Minor Changes

- 744cdac: Add configurable multilingual voice recognition, conservative vocabulary correction, clarification guards, and explicit Indic speech profiles.
- 48ab917: Voice calls ignore short sounds such as coughs, clicks and filler words, and only a longer or clearly meant phrase interrupts the assistant. Replies stay in the visitor's language, and the OpenAI-compatible adapter can send `reasoningEffort` so reasoning models answer sooner.
- 7db8074: Add configurable server speech providers and buffered browser audio.
- f98baa6: Add `listVoices`, `setVoice` and `previewVoice` to the client, a `voice.voiceId` option, and a recording cap of 25 seconds so long speech is sent instead of rejected. Fix the Sarvam text-to-speech request field and add every `bulbul:v3` voice as `SARVAM_VOICES`.

### Patch Changes

- Updated dependencies [744cdac]
- Updated dependencies [48ab917]
- Updated dependencies [7db8074]
- Updated dependencies [f98baa6]
  - @speeq/core@0.4.0
  - @speeq/server@0.4.0
  - @speeq/client@0.4.0
  - @speeq/react@0.4.0
  - @speeq/speech@0.4.0
  - @speeq/testing@0.4.0
  - @speeq/llm-openai-compatible@0.4.0
  - @speeq/llm-gemini@0.4.0
  - @speeq/store-memory@0.4.0
  - @speeq/store-mongodb@0.4.0

## 0.3.0

### Minor Changes

- bd5a5ea: Add a `thinkingBudget` option to the Gemini adapter. Setting it to `0` turns thinking off on models that allow it, so replies start sooner.
- 04991ca: Add hands-free calls: `startCall()` and `endCall()` keep the microphone on, show words live, send each phrase, speak replies, pause speech when the visitor talks over it and resume from the same spot if nothing real follows. Speech adapters can now be continuous and can pause and resume.
- 3df2081: Calls now watch the microphone level apart from speech recognition. The assistant pauses within about a tenth of a second when the visitor talks, even softly, and even before any words are recognised, so it can be interrupted while it greets. Add `call.voiceDetection` (on by default), `call.correct` to fix common mishearings, and `client.getMicLevel()` for level meters.

### Patch Changes

- Updated dependencies [bd5a5ea]
- Updated dependencies [04991ca]
- Updated dependencies [3df2081]
  - @speeq/llm-gemini@0.3.0
  - @speeq/core@0.3.0
  - @speeq/client@0.3.0
  - @speeq/react@0.3.0
  - @speeq/testing@0.3.0
  - @speeq/llm-openai-compatible@0.3.0
  - @speeq/store-memory@0.3.0
  - @speeq/store-mongodb@0.3.0
  - @speeq/server@0.3.0

## 0.2.0

### Minor Changes

- 941266b: Add the speeq umbrella package and dev update notice

### Patch Changes

- Updated dependencies [941266b]
  - @speeq/core@0.2.0
  - @speeq/client@0.2.0
  - @speeq/react@0.2.0
  - @speeq/server@0.2.0
  - @speeq/testing@0.2.0
  - @speeq/llm-openai-compatible@0.2.0
  - @speeq/llm-gemini@0.2.0
  - @speeq/store-memory@0.2.0
  - @speeq/store-mongodb@0.2.0

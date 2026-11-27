# @speeq/server

## 0.10.0

### Patch Changes

- 27b5a4a: The generated chat box now opens pages: it passes `onNavigate` to the router, so "open pricing" really moves the page (only to paths on your own site). It starts the conversation with a greeting and tappable suggestions taken from your approved pages, scrolls to the newest message, keeps the message list scrollable, shows "Thinking...", and focuses the input when opened. New configs keep the in-memory store on `globalThis`, so the assistant remembers the conversation after a dev hot reload; `npx speeq setup` offers the same change for an existing `speeq.config.ts`. The system prompt now tells the model to use earlier messages.
- @speeq/core@0.10.0

## 0.9.0

### Patch Changes

- @speeq/core@0.9.0

## 0.8.0

### Patch Changes

- @speeq/core@0.8.0

## 0.7.0

### Minor Changes

- 54755b9: `npx speeq init` now sets up a working assistant without writing code: it asks for a model provider (Groq, Gemini, OpenRouter, any OpenAI-compatible server, or mock) and voice, generates the chat box into your app, adds it to your root layout, and writes the needed variable names into `.env.local` for you to fill in (it never writes or reads your keys). Also adds draft-only form filling (`defineFormFill`, `useSpeeqForm`) and generated `.speeq/generated/ui.ts`.

### Patch Changes

- Updated dependencies [54755b9]
  - @speeq/core@0.7.0

## 0.6.0

### Minor Changes

- d687185: Add UI actions: the agent can ask the page to run a named, developer-declared browser function. Declare it with `defineUiAction` on the server, mount it with `useSpeeqAction` in React or `client.registerUiAction`, and the user approves write actions before they run. Additive and opt-in per session through the `ui-actions` capability; sessions without it never see the new events.

### Patch Changes

- Updated dependencies [d687185]
  - @speeq/core@0.6.0

## 0.5.0

### Patch Changes

- @speeq/core@0.5.0

## 0.4.0

### Minor Changes

- 744cdac: Add configurable multilingual voice recognition, conservative vocabulary correction, clarification guards, and explicit Indic speech profiles.
- 7db8074: Add configurable server speech providers and buffered browser audio.

### Patch Changes

- 48ab917: Voice calls ignore short sounds such as coughs, clicks and filler words, and only a longer or clearly meant phrase interrupts the assistant. Replies stay in the visitor's language, and the OpenAI-compatible adapter can send `reasoningEffort` so reasoning models answer sooner.
- Updated dependencies [744cdac]
- Updated dependencies [7db8074]
  - @speeq/core@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [04991ca]
  - @speeq/core@0.3.0

## 0.2.0

### Minor Changes

- 941266b: Add the speeq umbrella package and dev update notice

### Patch Changes

- Updated dependencies [941266b]
  - @speeq/core@0.2.0

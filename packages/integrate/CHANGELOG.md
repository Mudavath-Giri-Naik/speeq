# @speeq/integrate

## 0.7.0

### Minor Changes

- 54755b9: `npx speeq init` now sets up a working assistant without writing code: it asks for a model provider (Groq, Gemini, OpenRouter, any OpenAI-compatible server, or mock) and voice, generates the chat box into your app, adds it to your root layout, and writes the needed variable names into `.env.local` for you to fill in (it never writes or reads your keys). Also adds draft-only form filling (`defineFormFill`, `useSpeeqForm`) and generated `.speeq/generated/ui.ts`.

### Patch Changes

- Updated dependencies [54755b9]
  - @speeq/core@0.7.0
  - @speeq/server@0.7.0
  - @speeq/store-memory@0.7.0
  - @speeq/compiler@0.7.0
  - @speeq/testing@0.7.0

## 0.6.0

### Minor Changes

- d687185: Add UI actions: the agent can ask the page to run a named, developer-declared browser function. Declare it with `defineUiAction` on the server, mount it with `useSpeeqAction` in React or `client.registerUiAction`, and the user approves write actions before they run. Additive and opt-in per session through the `ui-actions` capability; sessions without it never see the new events.

### Patch Changes

- Updated dependencies [d687185]
  - @speeq/core@0.6.0
  - @speeq/server@0.6.0
  - @speeq/testing@0.6.0
  - @speeq/store-memory@0.6.0
  - @speeq/compiler@0.6.0

## 0.5.0

### Minor Changes

- 81d3a6c: Add the `speeq` command: `npx speeq init` scans a Next.js App Router app, lets you approve what the assistant may use and writes the glue code. `speeq doctor` and `speeq verify` report static, runtime and host readiness separately. The CLI, integration engine and compiler packages are now published.

### Patch Changes

- Updated dependencies [81d3a6c]
  - @speeq/compiler@0.5.0
  - @speeq/store-memory@0.5.0
  - @speeq/core@0.5.0
  - @speeq/server@0.5.0
  - @speeq/testing@0.5.0

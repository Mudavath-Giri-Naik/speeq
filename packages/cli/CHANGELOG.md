# @speeq/cli

## 0.7.0

### Minor Changes

- 54755b9: `npx speeq init` now sets up a working assistant without writing code: it asks for a model provider (Groq, Gemini, OpenRouter, any OpenAI-compatible server, or mock) and voice, generates the chat box into your app, adds it to your root layout, and writes the needed variable names into `.env.local` for you to fill in (it never writes or reads your keys). Also adds draft-only form filling (`defineFormFill`, `useSpeeqForm`) and generated `.speeq/generated/ui.ts`.

### Patch Changes

- Updated dependencies [54755b9]
  - @speeq/core@0.7.0
  - @speeq/integrate@0.7.0
  - @speeq/compiler@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [d687185]
  - @speeq/core@0.6.0
  - @speeq/integrate@0.6.0
  - @speeq/compiler@0.6.0

## 0.5.0

### Minor Changes

- 81d3a6c: Add the `speeq` command: `npx speeq init` scans a Next.js App Router app, lets you approve what the assistant may use and writes the glue code. `speeq doctor` and `speeq verify` report static, runtime and host readiness separately. The CLI, integration engine and compiler packages are now published.

### Patch Changes

- Updated dependencies [81d3a6c]
  - @speeq/integrate@0.5.0
  - @speeq/compiler@0.5.0
  - @speeq/core@0.5.0

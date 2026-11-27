# @speeq/cli

## 0.9.0

### Minor Changes

- 949070c: A guided terminal setup. `npx speeq init` now walks through language model, voice, languages and chat box with Back on every choice and a review screen. Each key you paste is checked at once: speeq lists which chat models really work with it (working, busy, rate limited, unavailable) and lets you pick one, and tests Groq Whisper and Gemini speech models so the model ids are filled in for you. Sarvam AI is a new voice choice (speech-to-text and text-to-speech, paid credits, key checked without using credits). `npx speeq setup` changes any of it later, and `npx speeq remove` takes speeq out of the project: only what it added, with a review first. Keys go only to the provider's own host and are never printed; they are saved only in `.env.local`.

### Patch Changes

- Updated dependencies [949070c]
  - @speeq/integrate@0.9.0
  - @speeq/compiler@0.9.0
  - @speeq/core@0.9.0

## 0.8.0

### Minor Changes

- 07c2699: New `npx speeq connect` (also offered at the end of `init`): paste your model key in the terminal (hidden), speeq checks it with the provider, tests which chat models work, lets you pick one, and saves the key and model in `.env.local`. It also offers to switch `speeq.config.ts` when it still uses a different provider than the key you pasted. Keys go only to the provider's own host and are never printed.

### Patch Changes

- Updated dependencies [07c2699]
  - @speeq/integrate@0.8.0
  - @speeq/compiler@0.8.0
  - @speeq/core@0.8.0

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

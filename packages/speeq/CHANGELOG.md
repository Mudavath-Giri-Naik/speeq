# speeq

## 0.12.1

### Patch Changes

- Updated dependencies [847c752]
  - @speeq/server@0.12.1
  - @speeq/cli@0.12.1
  - @speeq/client@0.12.1
  - @speeq/llm-gemini@0.12.1
  - @speeq/llm-openai-compatible@0.12.1
  - @speeq/speech@0.12.1
  - @speeq/store-memory@0.12.1
  - @speeq/store-mongodb@0.12.1
  - @speeq/core@0.12.1
  - @speeq/react@0.12.1
  - @speeq/testing@0.12.1

## 0.12.0

### Minor Changes

- ca00970: Customer and page context. `defineContext` wraps a service your app already has (cart, enrollments, subscriptions, recent activity) so the agent can read the signed-in customer's current data through the new built-in `get_context` tool, or in the prompt with `load: "initial"`. Every result goes through the server-verified user, a sign-in check, a timeout, the output schema, a projection to the `expose` paths only, removal of restricted fields and secret-looking values, and size limits; it is cached for one request and never stored in conversation history. Page context gains an allow-list (`context.page.allow`), secret query parameters are removed from the path in the browser and on the server, and the store keeps context key names only by default for apps that set the allow-list. The system prompt now separates trusted instructions from data blocks (signed-in state, exposed profile, customer context, page context) with `<` and `>` escaped, and keeps the safety rules last. The sensitive-name list is shared between the compiler and the runtime.
- 840a1a1: `speeq setup` is now the control center: a status card, twelve sections (agent identity and personality, business, model and behavior, voice and languages, authentication, customer context, page context, greetings and starters, memory, storage and retention, chat box, verification), each with a badge and one deterministically ranked recommendation. Business facts, presets and sign-in come from the code with file and line evidence. Bind a detected sign-in system, approve discovered customer data fields (restricted fields can never be approved; endpoints without a visible sign-in check need an explicit confirmation), preview greetings with sample data, choose memory modes, and set up MongoDB with a hidden URI and an optional connection check. Edits go to a draft; Save shows a diff, writes `.speeq/setup.json` (version 2), a server-only `.speeq/generated/agent.ts` (plus `identity.ts` and `context.ts`) and wires `...agentSettings` into `speeq.config.ts` once, through the integration journal so `speeq rollback` undoes it. Settings your own config overrides are reported. `speeq setup <section>` deep-links and `speeq setup --json` prints the state without secrets.
- 80daf07: Discovery for personalisation. `discoverPersonalization({ root, manifest })` finds the app's sign-in system with file and line evidence (Auth.js v5, NextAuth v4, Supabase Auth, Clerk, Better Auth bound automatically; Kinde and your own helpers flagged for review; Firebase Auth reported as unsupported with what to do), candidate customer data sources from GET endpoints (category, response fields, sensitive fields, auth and user-scope evidence, whether they can be bound without code) and business facts from layout metadata, package.json and the README. It runs separately from `scan`, so rescans stay incremental. The integration engine renders a server-only `resolveUser` for a detected sign-in system and context sources that call your own endpoints with the visitor's cookies, exposing only approved fields; sensitive fields can never be approved and endpoints without a visible sign-in check need an explicit review.
- b43d094: The assistant can know the business and sound the way you want. New `business` profile and `agent.description` / `agent.style` (personality, response length, explanation depth, name usage, follow-ups) map to fixed prompt lines that never touch the safety rules. Greetings and starter prompts are now chosen on the server, without a model call, from `greeting` templates (guest, member, returning, per page) and `starters` filtered by sign-in, page and the capabilities the app really has; a template whose value is missing is skipped, so names and counts are never invented. They arrive with the session and with `GET /identity?path=`; the client exposes `snapshot.greeting` and `newConversation()`. Errors carry a stable `reason` (rate limited, quota exhausted, invalid key, model unavailable, busy, network, timeout and more) with calm customer messages, and the server logs one actionable diagnostic line in development without keys or customer data. The generated chat box shows the server greeting and starters, checks who is signed in when it opens, says when an account change started a fresh conversation, and has a New conversation button. Agent presets (general, e-commerce, education, admissions, SaaS, logistics, support, custom) are available as data for the setup wizard.
- eafb316: The assistant now follows who is signed in. Session tokens are bound to the user and the tenant (`resolveUser` may return `tenantId` and a `profile`), so logging out, logging in, switching account or switching organisation ends the old conversation with the new `IDENTITY_CHANGED` code, and the browser client resets completely: no transcript, pending confirmation, page action, speech or late stream event of the previous user survives, and the stored session is removed. A failing `resolveUser` on a signed-in session now answers `AUTH_UNAVAILABLE` instead of looking like a logout. New `GET /identity` endpoint, `identity` in the session response, `identity.expose` server option, `client.refreshIdentity()` (also run on window focus) and the `useSpeeqIdentity()` React hook. Stores keep the tenant with each session and can filter by it. Older tokens and stored sessions keep working.
- 22327d0: Conversation memory. New `memory.mode`: `session` (default, unchanged), `persistent` (signed-in users continue their own latest conversation, chosen and checked by the server for the same user and tenant) and `preferences` (also keeps preferences the user states, through a built-in `remember_preference` tool offered only to signed-in users, in fixed categories, screened for contact details and secrets, shown to the model as "may be outdated" data and never as proof of access). New endpoints `GET /session/:id/messages` (own transcript) and `POST /session/:id/clear-memory` (forget or delete conversations and delete preferences; a cleared session answers `SESSION_EXPIRED`). Stores gain optional `getPreferences`, `setPreference` and `clearScope`; the memory and MongoDB stores implement them and the contract suite tests them. The client adds `restoreConversation()`, `clearMemory()` and `snapshot.memory`, and a session kept across a reload shows its transcript again. The generated chat box continues conversations, offers Forget, and notes saved preferences. `memory.retentionDays` shortens retention together with `audit.retentionDays`.
- 600f773: `speeq verify` and `speeq doctor` check personalisation: settings wired into speeq.config.ts, the bound sign-in still exists, cross-session memory has a signed-in user, the store fits the memory mode (MongoDB URI present and persistence verified), and approved context sources are generated. The runtime level runs your settings with a mock model and a test user: guest, sign-in, sign-out, account and tenant switch, a forged browser identity, greetings that use only real values, and memory that continues only the owner's conversation. `speeq verify --live-store` proves persistence in your MongoDB using temporary collections it drops afterwards. Fixed: the generated chat box passed a wrongly shaped `getContext`, which failed strict type checks (`next build`) in host apps; the client already sends the page path and title.

### Patch Changes

- Updated dependencies [ca00970]
- Updated dependencies [840a1a1]
- Updated dependencies [b43d094]
- Updated dependencies [eafb316]
- Updated dependencies [22327d0]
- Updated dependencies [600f773]
  - @speeq/core@0.12.0
  - @speeq/server@0.12.0
  - @speeq/client@0.12.0
  - @speeq/cli@0.12.0
  - @speeq/react@0.12.0
  - @speeq/llm-gemini@0.12.0
  - @speeq/store-memory@0.12.0
  - @speeq/store-mongodb@0.12.0
  - @speeq/testing@0.12.0
  - @speeq/llm-openai-compatible@0.12.0
  - @speeq/speech@0.12.0

## 0.11.0

### Minor Changes

- 111447c: A calmer, more human assistant. The generated chat box has a new black-and-white design (light and dark, smooth CSS-only motion, typing indicator, icon buttons, greeting by time of day) and sends the current page path and title as context. The system prompt now asks for a warm, natural spoken tone (and natural Telugu and Hindi instead of word-for-word translation), and the page list is shorter. Opening a page now takes one model call instead of two when the model says its line in the same reply.

### Patch Changes

- 1a150cf: `npx speeq setup` now also refreshes a chat box that an older speeq generated (updating the package does not rewrite it), and the CLI guide explains that `npx speeq upgrade` is the step after updating.
- Updated dependencies [111447c]
- Updated dependencies [1a150cf]
  - @speeq/server@0.11.0
  - @speeq/cli@0.11.0
  - @speeq/client@0.11.0
  - @speeq/llm-gemini@0.11.0
  - @speeq/llm-openai-compatible@0.11.0
  - @speeq/speech@0.11.0
  - @speeq/store-memory@0.11.0
  - @speeq/store-mongodb@0.11.0
  - @speeq/core@0.11.0
  - @speeq/react@0.11.0
  - @speeq/testing@0.11.0

## 0.10.0

### Minor Changes

- 27b5a4a: The generated chat box now opens pages: it passes `onNavigate` to the router, so "open pricing" really moves the page (only to paths on your own site). It starts the conversation with a greeting and tappable suggestions taken from your approved pages, scrolls to the newest message, keeps the message list scrollable, shows "Thinking...", and focuses the input when opened. New configs keep the in-memory store on `globalThis`, so the assistant remembers the conversation after a dev hot reload; `npx speeq setup` offers the same change for an existing `speeq.config.ts`. The system prompt now tells the model to use earlier messages.

### Patch Changes

- Updated dependencies [27b5a4a]
  - @speeq/cli@0.10.0
  - @speeq/server@0.10.0
  - @speeq/client@0.10.0
  - @speeq/llm-gemini@0.10.0
  - @speeq/llm-openai-compatible@0.10.0
  - @speeq/speech@0.10.0
  - @speeq/store-memory@0.10.0
  - @speeq/store-mongodb@0.10.0
  - @speeq/core@0.10.0
  - @speeq/react@0.10.0
  - @speeq/testing@0.10.0

## 0.9.0

### Minor Changes

- 949070c: A guided terminal setup. `npx speeq init` now walks through language model, voice, languages and chat box with Back on every choice and a review screen. Each key you paste is checked at once: speeq lists which chat models really work with it (working, busy, rate limited, unavailable) and lets you pick one, and tests Groq Whisper and Gemini speech models so the model ids are filled in for you. Sarvam AI is a new voice choice (speech-to-text and text-to-speech, paid credits, key checked without using credits). `npx speeq setup` changes any of it later, and `npx speeq remove` takes speeq out of the project: only what it added, with a review first. Keys go only to the provider's own host and are never printed; they are saved only in `.env.local`.

### Patch Changes

- Updated dependencies [949070c]
  - @speeq/cli@0.9.0
  - @speeq/llm-gemini@0.9.0
  - @speeq/llm-openai-compatible@0.9.0
  - @speeq/speech@0.9.0
  - @speeq/store-memory@0.9.0
  - @speeq/store-mongodb@0.9.0
  - @speeq/client@0.9.0
  - @speeq/core@0.9.0
  - @speeq/react@0.9.0
  - @speeq/server@0.9.0
  - @speeq/testing@0.9.0

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

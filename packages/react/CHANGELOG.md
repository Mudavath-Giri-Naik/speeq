# @speeq/react

## 0.12.1

### Patch Changes

- @speeq/client@0.12.1

## 0.12.0

### Minor Changes

- b43d094: The assistant can know the business and sound the way you want. New `business` profile and `agent.description` / `agent.style` (personality, response length, explanation depth, name usage, follow-ups) map to fixed prompt lines that never touch the safety rules. Greetings and starter prompts are now chosen on the server, without a model call, from `greeting` templates (guest, member, returning, per page) and `starters` filtered by sign-in, page and the capabilities the app really has; a template whose value is missing is skipped, so names and counts are never invented. They arrive with the session and with `GET /identity?path=`; the client exposes `snapshot.greeting` and `newConversation()`. Errors carry a stable `reason` (rate limited, quota exhausted, invalid key, model unavailable, busy, network, timeout and more) with calm customer messages, and the server logs one actionable diagnostic line in development without keys or customer data. The generated chat box shows the server greeting and starters, checks who is signed in when it opens, says when an account change started a fresh conversation, and has a New conversation button. Agent presets (general, e-commerce, education, admissions, SaaS, logistics, support, custom) are available as data for the setup wizard.
- eafb316: The assistant now follows who is signed in. Session tokens are bound to the user and the tenant (`resolveUser` may return `tenantId` and a `profile`), so logging out, logging in, switching account or switching organisation ends the old conversation with the new `IDENTITY_CHANGED` code, and the browser client resets completely: no transcript, pending confirmation, page action, speech or late stream event of the previous user survives, and the stored session is removed. A failing `resolveUser` on a signed-in session now answers `AUTH_UNAVAILABLE` instead of looking like a logout. New `GET /identity` endpoint, `identity` in the session response, `identity.expose` server option, `client.refreshIdentity()` (also run on window focus) and the `useSpeeqIdentity()` React hook. Stores keep the tenant with each session and can filter by it. Older tokens and stored sessions keep working.
- 22327d0: Conversation memory. New `memory.mode`: `session` (default, unchanged), `persistent` (signed-in users continue their own latest conversation, chosen and checked by the server for the same user and tenant) and `preferences` (also keeps preferences the user states, through a built-in `remember_preference` tool offered only to signed-in users, in fixed categories, screened for contact details and secrets, shown to the model as "may be outdated" data and never as proof of access). New endpoints `GET /session/:id/messages` (own transcript) and `POST /session/:id/clear-memory` (forget or delete conversations and delete preferences; a cleared session answers `SESSION_EXPIRED`). Stores gain optional `getPreferences`, `setPreference` and `clearScope`; the memory and MongoDB stores implement them and the contract suite tests them. The client adds `restoreConversation()`, `clearMemory()` and `snapshot.memory`, and a session kept across a reload shows its transcript again. The generated chat box continues conversations, offers Forget, and notes saved preferences. `memory.retentionDays` shortens retention together with `audit.retentionDays`.

### Patch Changes

- Updated dependencies [ca00970]
- Updated dependencies [b43d094]
- Updated dependencies [eafb316]
- Updated dependencies [22327d0]
  - @speeq/client@0.12.0

## 0.11.0

### Patch Changes

- @speeq/client@0.11.0

## 0.10.0

### Patch Changes

- @speeq/client@0.10.0

## 0.9.0

### Patch Changes

- @speeq/client@0.9.0

## 0.8.0

### Patch Changes

- @speeq/client@0.8.0

## 0.7.0

### Minor Changes

- 54755b9: `npx speeq init` now sets up a working assistant without writing code: it asks for a model provider (Groq, Gemini, OpenRouter, any OpenAI-compatible server, or mock) and voice, generates the chat box into your app, adds it to your root layout, and writes the needed variable names into `.env.local` for you to fill in (it never writes or reads your keys). Also adds draft-only form filling (`defineFormFill`, `useSpeeqForm`) and generated `.speeq/generated/ui.ts`.

### Patch Changes

- Updated dependencies [54755b9]
  - @speeq/client@0.7.0

## 0.6.0

### Minor Changes

- d687185: Add UI actions: the agent can ask the page to run a named, developer-declared browser function. Declare it with `defineUiAction` on the server, mount it with `useSpeeqAction` in React or `client.registerUiAction`, and the user approves write actions before they run. Additive and opt-in per session through the `ui-actions` capability; sessions without it never see the new events.

### Patch Changes

- Updated dependencies [d687185]
  - @speeq/client@0.6.0

## 0.5.0

### Patch Changes

- @speeq/client@0.5.0

## 0.4.0

### Minor Changes

- 744cdac: Add configurable multilingual voice recognition, conservative vocabulary correction, clarification guards, and explicit Indic speech profiles.
- 7db8074: Add configurable server speech providers and buffered browser audio.

### Patch Changes

- Updated dependencies [744cdac]
- Updated dependencies [48ab917]
- Updated dependencies [7db8074]
- Updated dependencies [f98baa6]
  - @speeq/client@0.4.0

## 0.3.0

### Minor Changes

- 04991ca: Add hands-free calls: `startCall()` and `endCall()` keep the microphone on, show words live, send each phrase, speak replies, pause speech when the visitor talks over it and resume from the same spot if nothing real follows. Speech adapters can now be continuous and can pause and resume.

### Patch Changes

- Updated dependencies [04991ca]
- Updated dependencies [3df2081]
  - @speeq/client@0.3.0

## 0.2.0

### Minor Changes

- 941266b: Add the speeq umbrella package and dev update notice

### Patch Changes

- Updated dependencies [941266b]
  - @speeq/client@0.2.0

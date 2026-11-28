# @speeq/store-memory

## 0.12.1

### Patch Changes

- @speeq/core@0.12.1

## 0.12.0

### Minor Changes

- eafb316: The assistant now follows who is signed in. Session tokens are bound to the user and the tenant (`resolveUser` may return `tenantId` and a `profile`), so logging out, logging in, switching account or switching organisation ends the old conversation with the new `IDENTITY_CHANGED` code, and the browser client resets completely: no transcript, pending confirmation, page action, speech or late stream event of the previous user survives, and the stored session is removed. A failing `resolveUser` on a signed-in session now answers `AUTH_UNAVAILABLE` instead of looking like a logout. New `GET /identity` endpoint, `identity` in the session response, `identity.expose` server option, `client.refreshIdentity()` (also run on window focus) and the `useSpeeqIdentity()` React hook. Stores keep the tenant with each session and can filter by it. Older tokens and stored sessions keep working.
- 22327d0: Conversation memory. New `memory.mode`: `session` (default, unchanged), `persistent` (signed-in users continue their own latest conversation, chosen and checked by the server for the same user and tenant) and `preferences` (also keeps preferences the user states, through a built-in `remember_preference` tool offered only to signed-in users, in fixed categories, screened for contact details and secrets, shown to the model as "may be outdated" data and never as proof of access). New endpoints `GET /session/:id/messages` (own transcript) and `POST /session/:id/clear-memory` (forget or delete conversations and delete preferences; a cleared session answers `SESSION_EXPIRED`). Stores gain optional `getPreferences`, `setPreference` and `clearScope`; the memory and MongoDB stores implement them and the contract suite tests them. The client adds `restoreConversation()`, `clearMemory()` and `snapshot.memory`, and a session kept across a reload shows its transcript again. The generated chat box continues conversations, offers Forget, and notes saved preferences. `memory.retentionDays` shortens retention together with `audit.retentionDays`.

### Patch Changes

- Updated dependencies [ca00970]
- Updated dependencies [b43d094]
- Updated dependencies [eafb316]
- Updated dependencies [22327d0]
  - @speeq/core@0.12.0

## 0.11.0

### Patch Changes

- @speeq/core@0.11.0

## 0.10.0

### Patch Changes

- @speeq/core@0.10.0

## 0.9.0

### Patch Changes

- @speeq/core@0.9.0

## 0.8.0

### Patch Changes

- @speeq/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [54755b9]
  - @speeq/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [d687185]
  - @speeq/core@0.6.0

## 0.5.0

### Patch Changes

- @speeq/core@0.5.0

## 0.4.0

### Patch Changes

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

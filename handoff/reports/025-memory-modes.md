# REPORT 025 — Memory modes: persistent conversations, stated preferences, clearing

Status: DONE (built by the architect; ADR-0025 accepted with amendments)
Verify: lint ✅ · typecheck ✅ · tests 1032/0 · build ✅
Files: created `server/src/handler/memory.ts`, tests `server/test/memory.test.ts`, `client/test/memory.test.ts`,
guide `docs/guides/memory.md`, changeset; modified core store interface, audit and http schemas and exports,
server config/resolve/runtime/index, session/identity/turn handlers and router, tools and prompt, greeting,
client session/identity/types/client and tsup wire list, react hook, both stores, store contract, chat box
template, telemetry privacy test, demo test mock, protocol/server-config/stores docs, ADR-0025.

What I did:

- `memory.mode` session | persistent | preferences with resume window, transcript turns, retention,
  preference expiry, categories, forget or delete, allowClear. Startup fails with NOT_CONFIGURED naming the
  store methods that are missing.
- Resume: `POST /session { resume: true }` continues the verified user's latest conversation in the same
  tenant; user and tenant re-checked in the server (a test uses a store that ignores the filter). Never for
  anonymous visitors, empty, forgotten or stale sessions; anonymous history is never merged after sign-in.
- `GET /session/:id/messages` (own session, text roles only) and `POST /session/:id/clear-memory`
  (signed-in only). `authenticate` answers SESSION_EXPIRED for a forgotten session, so other tabs start fresh.
- `remember_preference`: offered only to signed-in users in preferences mode, strict schema with the
  enabled categories, values screened for emails, long numbers, keys and tokens, scope from the verified user.
  Preferences rendered as escaped data "may be outdated", never evidence of ownership or access.
- Stores: optional `getPreferences`, `setPreference`, `clearScope` in memory and MongoDB stores (MongoDB
  `speeq_preferences`, index created on first use only); contract suite covers isolation, expiry, forget and delete.
- Client: `restoreConversation()` (never opens a session just to check), `clearMemory()`, `snapshot.memory`,
  no resume right after New conversation; a session kept across a reload shows its transcript again.
- Chat box: continues on open, Forget button with confirm, "Saved to your preferences." note.
- Retention: the shorter of `memory.retentionDays` and `audit.retentionDays`. Greeting "returning" skips
  forgotten sessions.

Deviations: clearing is `POST /session/:id/clear-memory`, not `DELETE` (existing generated routes export only
GET, POST, OPTIONS). The transcript endpoint works in every mode (own session). No new audit event types for
resume or clear (no schema change). MongoDB terminal setup and the verify round trip move to 027 and 028.
Decisions: preferences are always deleted on clear when the store supports them; `body.preferences: false` keeps them.
Risks: signed-in session requests read the session summary once more (indexed by id) to honour forget.
A resumed session keeps the UI-action capability recorded when it was created.
Open questions: none

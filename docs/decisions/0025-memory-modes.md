# ADR-0025 — Memory: session by default, persistent conversations and stated preferences by opt-in

Status: Proposed (accepted with task 025).

## Decision

1. `memory.mode`: `"session"` (default, today's behaviour), `"persistent"`, `"preferences"` (persistent
   plus preference memory). Anonymous sessions are always `session`.
2. **Persistent = resume the same session**, not copy it. `POST /session { resume: true }` with a verified
   user finds the scope's most recent non-forgotten session (`listSessions({ userId, tenantId, limit: 1 })`,
   younger than `memory.resumeWithinHours`, default 72) and issues a fresh token for it. The stored session's
   `userId` and `tenantId` must equal the fresh identity, checked in the server, not the store. The client
   then reads `GET /session/:id/messages` (authenticated; user and assistant text only, last
   `memory.historyTurns`) to show the transcript.
3. **Preferences** are explicit statements only, in fixed categories: `language`, `explanation_depth`,
   `subject`, `product_category`, `communication_style` (the developer enables a subset). Saved only
   through the built-in `remember_preference { category, value ≤ 120 chars }`, which the prompt allows
   only when the user states a preference. The chat box shows "Saved: …". Rendered as
   `<preferences note="stated by the user, may be outdated">`. Never ownership, access or anything
   inferred; memory is never evidence of entitlement.
4. **Store contract** gains optional methods (memory and MongoDB adapters implement them; the contract
   suite tests them): `getPreferences(scope)`, `setPreference(scope, category, value, expiresAt)`,
   `clearScope(scope, { conversations: "forget" | "delete" | false, preferences: boolean })`.
   `scope = { userId, tenantId: string | null }`. A store without them disables `persistent` with a clear
   `NOT_CONFIGURED` at startup.
5. **Clearing**: `DELETE /session/:id/memory` (authenticated) and a chat box control. `forget` (default)
   hides sessions from resume, messages and the model, while the store's audit retention still applies;
   `delete` removes them. Docs say plainly that `forget` keeps audit records until retention.
6. **Retention**: `memory.retentionDays` (conversations, through the existing `retentionDays` purge) and
   `memory.preferenceDays` (default 180, stored as `expiresAt`).
7. **MongoDB setup** in the terminal: hidden URI input, values only in `.env.local`
   (`SPEEQ_MONGODB_URI`, `SPEEQ_MONGODB_DB`), connectivity `ping` and a write probe in a `speeq_probe`
   collection only after the developer agrees, no reads of other collections, no migrations. Status levels:
   `memory store`, `persistent configured`, `connection verified`, `persistence verified` (resume round
   trip in `speeq verify`).

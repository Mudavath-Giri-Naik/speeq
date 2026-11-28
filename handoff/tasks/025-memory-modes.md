# TASK 025 — Memory modes: persistent conversations, stated preferences, clearing

Branch: task/025-memory-modes (from main at 9aa7085)

## 1. Read first

`docs/decisions/0025-memory-modes.md`, `docs/maintainers/release-0.12-plan.md`,
`packages/core/src/interfaces/store.ts`, `packages/core/src/schemas/{audit,http}.ts`,
`packages/server/src/{runtime,resolve,config}.ts`, `packages/server/src/handler/{index,session,turn,identity}.ts`,
`packages/server/src/agent/{tools,prompt,history}.ts`, `packages/client/src/{client,session,identity,types}.ts`,
`packages/adapters/store-{memory,mongodb}/src/index.ts`, `packages/testing/src/store-contract.ts`.

## 2. Goal

Signed-in users can continue their last conversation across visits (`persistent`), and the agent can keep
explicit preferences the user states (`preferences`). Users can clear what SPEEQ keeps about them. Session
mode stays the default and behaves exactly like 0.11.

## 3. Decisions (do not re-decide)

- `memory.mode`: `session` (default) | `persistent` | `preferences` (= persistent + preferences). Anonymous
  visitors always get `session`.
- Resume reuses the stored session (no copying, no merging of anonymous history). The server picks the
  candidate from `listSessions({ userId, tenantId?, limit: 10 })` and accepts only a summary whose
  `userId` and `tenantId ?? null` equal the fresh identity, that is not forgotten, has `turnCount > 0`, and
  whose `lastEventAt` is within `resumeWithinHours` (default 72). The client cannot name a session.
- `forgottenAt` on `SessionSummary` marks a forgotten session. `Runtime.authenticate` rejects requests on a
  forgotten session with `SESSION_EXPIRED` (the client then opens a new session), when the store supports
  `clearScope` and the token belongs to a signed-in user. Forgotten sessions stay visible to the audit API.
- Preferences: fixed categories `language`, `explanation_depth`, `subject`, `product_category`,
  `communication_style`. Saved only through built-in `remember_preference { category, value }`, offered to
  signed-in users only, value 1 to 120 chars, rejected if it contains anything secret or personal
  (`redactText` changes it or `looksSecret`). Upsert per category. Expiry `preferenceDays` (default 180).
- Prompt renders preferences as data: `<preferences note="stated by the user, may be outdated">` with
  escaped values, plus fixed rules: use them as hints; never as proof of ownership, access or purchases;
  call `remember_preference` only when the user clearly states a lasting preference.
- Clearing: `POST /session/:id/clear-memory` (authenticated, signed-in only, else `FORBIDDEN`), body
  `{ preferences?: boolean }` (default true). Conversations are forgotten (`memory.clear: "forget"`,
  default) or deleted (`"delete"`). Disabled with `memory.allowClear: false` (`FORBIDDEN`).
- Retention: `memory.retentionDays` shortens conversation retention: the purge uses the smaller of it and
  `audit.retentionDays`. Preferences expire by `expiresAt`, filtered on read.
- Store capability: `clearScope` is required for `persistent`, plus `getPreferences`/`setPreference` for
  `preferences`; otherwise `resolveConfig` fails with `NOT_CONFIGURED` naming the missing methods.
- Transcript: `GET /session/:id/messages` (authenticated) returns user and assistant text of that session,
  last `memory.historyTurns` user turns (default 20, max 100). Works in every mode (own session only).
- Client: `restoreConversation()`, `clearMemory()`, `newConversation()` (no resume next time);
  `snapshot.memory` from session config and identity probe. Chat box restores on open for signed-in users
  when `memory.resume`, offers "Forget my conversations" when `memory.clear`, notes "Saved: …".
- MongoDB terminal setup and the verify round trip ship in 027 and 028.

## 4. Scope

Modify: core (store interface, audit and http schemas), server (config, resolve, runtime, handlers, tools,
prompt, turn), client, react hook, store-memory, store-mongodb, testing contract, integrate chat box
template, telemetry privacy test, docs (`docs/guides/memory.md`, server-config reference), changeset.
Do not touch: compiler, cli.

## 6. Contracts

```ts
// core/interfaces/store.ts
export interface MemoryScope { userId: string; tenantId: string | null }
export interface StoredPreference { category: string; value: string; updatedAt: string; expiresAt: string }
export interface ClearScopeOptions { conversations: "forget" | "delete" | false; preferences: boolean }
export interface ClearScopeResult { sessions: number; preferences: number }
interface ConversationStore {
  getPreferences?(scope: MemoryScope): Promise<StoredPreference[]>;          // unexpired only
  setPreference?(scope: MemoryScope, category: string, value: string, expiresAt: string): Promise<void>;
  clearScope?(scope: MemoryScope, options: ClearScopeOptions): Promise<ClearScopeResult>;
}
// http: CreateSessionRequest.resume?: boolean; CreateSessionResponse.resumed?: boolean;
// ClientConfig.memory?: { resume: boolean; clear: boolean; preferences: boolean } (per visitor);
// IdentityResponse.memory?: same; SessionMessagesResponse { protocolVersion, messages: { role, text, ts }[] };
// ClearMemoryResponse { protocolVersion, sessions, preferences }
// server config
memory?: { mode?, resumeWithinHours?, historyTurns?, retentionDays?, preferenceDays?,
           categories?: PreferenceCategory[], clear?: "forget" | "delete", allowClear?: boolean }
```

## 7. Tests required

Store contract (memory + MongoDB): preference upsert, scope isolation by user and tenant, expiry filtering,
clearScope forget (sessions marked, events kept) and delete (sessions and events gone), other scopes untouched.
Server: resume picks own latest session; never another user's or tenant's; never a forgotten, empty or too old
one; anonymous never resumes; session mode ignores `resume`; forgotten session token → `SESSION_EXPIRED`;
messages endpoint returns only text roles and rejects another session's token; clear forbidden for anonymous
and with `allowClear: false`; `remember_preference` absent for anonymous and in non-preferences modes, rejects
secret or personal values and unknown categories, upserts; preferences rendered as escaped data with the
"may be outdated" note; a malicious preference cannot reach the trusted section; account switch A → B never
shows A's conversation or preferences; config fails without store methods; retention uses the smaller value.
Client: restoreConversation loads transcript only when the server resumed; newConversation does not resume;
clearMemory resets. Telemetry: no preference values or categories in telemetry payloads.

## 8. Acceptance

`scripts/verify.sh` passes; 0.11 configs (no `memory`) behave unchanged.

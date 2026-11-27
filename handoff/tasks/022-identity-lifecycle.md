# TASK 022 — Identity lifecycle and account isolation

Branch: task/022-identity-lifecycle (create it from latest main)

## 1. Read first

- `docs/maintainers/release-0.12-plan.md` (whole file) and `docs/decisions/0022-identity-lifecycle.md`.
- `packages/server/src/runtime.ts` (`resolveUser`, `authenticate`), `packages/server/src/security/token.ts`,
  `packages/server/src/handler/session.ts`, `handler/index.ts` (routing, CORS), `handler/turn.ts`,
  `handler/ui.ts`, `speech/handlers.ts`.
- `packages/core/src/interfaces/context.ts` (`AgentUser`), `core/src/errors.ts`, `core/src/schemas/http.ts`,
  `core/src/schemas/audit.ts` (`NewSession`, `SessionSummary`, `SessionFilter`).
- `packages/client/src/session.ts`, `client/src/client.ts`, `client/src/types.ts`; `packages/react/src/hooks.ts`.
- `packages/adapters/store-memory/src`, `store-mongodb/src/index.ts`, `packages/testing` store contract.
- `packages/server/test/telemetry-privacy.test.ts`.

## 2. Goal

The server stays the only judge of identity, and the browser follows it. After this task: tokens are bound
to user **and** tenant; an identity change on any session request yields `IDENTITY_CHANGED`; a broken
`resolveUser` yields `AUTH_UNAVAILABLE` instead of looking like a logout; the client resets completely
on an identity change (no transcript, confirmation, UI action, speech or late stream event survives) and
notices logins and logouts while open through `GET /identity`.

## 3. Decisions already made (do NOT change or re-decide)

- Everything in ADR-0022 decisions 1 to 7. The architect writes `token.ts` and `Runtime.authenticate`
  changes on this branch **before** you start (commit `feat(server): tenant-bound session tokens …`).
  Do not edit those two functions; build on them.
- New error codes, appended to the end of `ERROR_CODES`: `IDENTITY_CHANGED` (401, not retryable,
  message "Your account changed. Starting a fresh conversation."), `AUTH_UNAVAILABLE` (503, retryable,
  message "Sign-in is temporarily unavailable. Please try again in a moment."). Already added by the
  architect's commit.
- `identity.expose` default `[]`. Allowed entries: `"displayName" | "preferredName" | "locale"`. (`roles` and
  `attributes` are reserved for task 023 and rejected with `NOT_CONFIGURED` for now.)
- Fingerprint is computed only on the server (`identityFingerprint(user, secret)` in `security/token.ts`, written
  by the architect). The client compares strings; it never derives anything from them.
- Login and logout always start a fresh conversation. No migration of anonymous history.
- The probe is `GET {endpoint}/identity`, no bearer token, uses the session-creation rate limiter key, returns
  `{ protocolVersion, identity }`. It never creates a session and never writes to the store.
- Probe triggers in the client: `visibilitychange` to visible, window `focus` (both throttled to once per
  5000 ms), `refreshIdentity()`, and only while a session exists. No polling timers.

## 4. Scope

Create: `packages/server/src/handler/identity.ts`, `packages/client/src/identity.ts`,
`packages/server/test/identity-lifecycle.test.ts`, `packages/client/test/identity.test.ts`,
`packages/react/test/identity.test.tsx`, `.changeset/identity-lifecycle.md`.
Modify: `packages/core/src/interfaces/context.ts`, `core/src/schemas/http.ts`, `core/src/schemas/audit.ts`,
`packages/server/src/config.ts`, `server/src/resolve.ts`, `server/src/handler/session.ts`,
`server/src/handler/index.ts`, `packages/client/src/session.ts`, `client/src/client.ts`,
`client/src/types.ts`, `client/src/index.ts`, `packages/react/src/hooks.ts`, `react/src/index.ts`,
both store adapters (store and return `tenantId`, filter by it), `packages/testing` store contract,
`packages/server/test/telemetry-privacy.test.ts`, `docs/reference/` pages for errors, protocol and the client API.
Do NOT touch: `security/token.ts`, `Runtime.authenticate`, the compiler, the CLI, the generated chat box
(`integrate/ui-template.ts`, task 024 wires it), prompt construction.

## 5. Requirements

1. `AgentUser` gains `tenantId?: string` and `profile?: AgentUserProfile` (contract below), JSDoc on each.
2. `NewSession`, `SessionSummary` gain `tenantId: string | null` (optional on read for old records, which
   read as `null`); `SessionFilter` gains `tenantId?: string`. Both adapters persist and filter it; the
   store contract tests it, including old records without the field.
3. `POST /session` stores `tenantId`, signs v2 claims (architect's helper), and returns
   `identity` (summary with only exposed profile fields, each trimmed and cut to 80 chars, control
   characters removed).
4. `GET /identity` as decided; `405` for other methods; CORS identical to `POST /session`.
5. `confirm`, `ui-result`, `turn` and speech requests surface `IDENTITY_CHANGED` and `AUTH_UNAVAILABLE`
   unchanged to the client (as JSON errors before a stream starts; no partial stream).
6. Client: a `generation` counter increments on every reset; every stream reader, confirmation and
   UI-action resolution checks it and drops anything from an older generation.
7. Client reset (ADR-0022 decision 6) runs on `IDENTITY_CHANGED` from any request, or a probe whose
   fingerprint differs from the current session's. After reset `snapshot.messages` is empty, no
   confirmation or UI action is pending, speech output is stopped, `sessionStorage` entry is removed,
   `snapshot.identity` holds the new summary, and an `identity` event fires once.
8. `AUTH_UNAVAILABLE`: no reset; `snapshot.error` set with the public message; the same session is
   kept and the next request retries normally.
9. New client API: `refreshIdentity(): Promise<IdentitySummary | null>`, `snapshot.identity`,
   event `identity`. React: `useSpeeqIdentity(): { identity, refresh }`.
10. Old v1 tokens: an active session from 0.11 keeps working after the upgrade (`tid` null).
11. Telemetry: `tenantId`, `profile`, `displayName`, `preferredName`, `locale`, `fingerprint`, `identity` are in
    the forbidden-fields list, and a test proves none is sent.

## 6. Contracts

```ts
// core/src/interfaces/context.ts
export interface AgentUserProfile {
  displayName?: string; preferredName?: string; locale?: string;
  roles?: string[]; attributes?: Record<string, string | number | boolean>;
}
export interface AgentUser { id: string; tenantId?: string; profile?: AgentUserProfile }

// core/src/schemas/http.ts
export const IdentitySummarySchema = z.object({
  state: z.enum(["anonymous", "authenticated"]),
  fingerprint: z.string().min(1).max(32),
  profile: z.object({
    displayName: z.string().max(80).optional(),
    preferredName: z.string().max(80).optional(),
    locale: z.string().max(35).optional(),
  }).optional(),
});
// CreateSessionResponseSchema gains: identity: IdentitySummarySchema.optional()  (optional for old servers)
export const IdentityResponseSchema = z.object({ protocolVersion: z.number(), identity: IdentitySummarySchema });

// server config
identity?: { expose?: ("displayName" | "preferredName" | "locale")[] };

// client
refreshIdentity(): Promise<IdentitySummary | null>;   // null when no session yet
// SpeeqSnapshot gains identity: IdentitySummary | null; SpeeqClientEvents gains identity: IdentitySummary
```

## 7. Tests required (security cases are mandatory, each its own `it`)

Server (`identity-lifecycle.test.ts`, using `@speeq/testing` mock LLM and a `resolveUser` driven by a
test cookie): fake user id, role or email in a turn or session body is ignored; anonymous → login
(cookie added) → turn with the old token gives `IDENTITY_CHANGED`; logout → `IDENTITY_CHANGED`; A then B
in the same "browser" (cookie switched) → B's requests with A's token rejected, B's new session has no
events of A; tenant switch mid-conversation → `IDENTITY_CHANGED`; pending confirmation of A approved with
B's cookie → rejected and the write tool never runs; `ui-result` under a switched identity → rejected;
`resolveUser` throws on a signed-in session → `AUTH_UNAVAILABLE`, nothing runs, and the next request
with the auth back works; throw at session creation with and without `allowAnonymous`; v1 token accepted;
probe returns only exposed fields and never writes to the store; probe rate limited.
Client (`identity.test.ts`, fake fetch): reset clears messages, confirmation, UI actions, speech, storage;
an SSE chunk arriving after reset is dropped; probe throttling; `AUTH_UNAVAILABLE` keeps the session;
no probe before a session exists. React: `useSpeeqIdentity` updates on reset.

## 8. Acceptance

- `scripts/verify.sh` passes; report the test count before and after.
- `pnpm --filter @speeq/server test identity` lists every security case from section 7 by name.
- No change to the public behaviour of apps without `tenantId`, `profile` or `identity` beyond the new
  `identity` field in responses and the `IDENTITY_CHANGED` code replacing the uid-mismatch `FORBIDDEN`.

## 9. Finish

Commit on the branch (Conventional Commits, no attribution). Write `handoff/reports/022-identity-lifecycle.md`
from `handoff/REPORT_TEMPLATE.md` and print it. Do not merge to main. Do not push.

# ADR-0022 — Identity lifecycle: the server decides who is talking, on every request

Status: Proposed (accepted with task 022).

## Context

`Runtime.authenticate` already calls `resolveUser` on every session request and rejects a token whose
`uid` differs from the fresh identity (`FORBIDDEN`). Gaps:

1. No tenant: a user switching organisation keeps the session and its history.
2. `resolveUser` throwing is treated as anonymous. For a signed-in session this becomes a uid mismatch,
   so a brief auth outage looks like an account switch.
3. The browser recovers only from 401 `SESSION_EXPIRED`/`UNAUTHENTICATED`. On the 403 the chat box is stuck,
   and the previous user's transcript, pending confirmation and speech queue stay on screen.
4. Logging in or out while the chat box is open is noticed only at the next turn.
5. `AgentUser` is `{ id }` only, so nothing safe can be shown to the model or used in a greeting.

## Decision

1. **AgentUser grows additively.**
   `AgentUser { id: string; tenantId?: string; profile?: AgentUserProfile }`, with
   `AgentUserProfile { displayName?, preferredName?, locale?, roles?: string[], attributes?: Record<string, string | number | boolean> }`.
   `id` and `tenantId` are for isolation only and never reach the prompt, the client or telemetry.
   Profile fields reach the model only if listed in `identity.expose` (default `[]`, so existing apps
   behave as today). `roles` is never an authorisation input for the model; tools keep using `ctx.user`.
2. **Token claims v2**: `{ v: 2, sid, uid, tid, exp }`, `tid` = `tenantId ?? null`. v1 tokens still verify
   (`tid` read as `null`). The session record stores `tenantId` (additive store field).
3. **`authenticate` outcomes** (fresh `resolveUser` against the claims):
   - same `uid` and `tid` → proceed;
   - different `uid` or `tid` (including logout, expiry of the host session, account or tenant switch) →
     **`IDENTITY_CHANGED`** (new code, HTTP 401, not retryable with the same token);
   - `resolveUser` throws and the claims have a `uid` → **`AUTH_UNAVAILABLE`** (new code, 503, retryable).
     Nothing private runs. Anonymous sessions (`uid: null`) continue as anonymous.
   - At session creation a throw stays "anonymous" when `allowAnonymous`, else `AUTH_UNAVAILABLE`.
     Every session request goes through `authenticate`: turn, confirm, ui-result, speech, and the new
     memory and messages endpoints. A pending confirmation therefore cannot be approved by another identity.
4. **Identity summary.** `POST /session` returns `identity: { state: "anonymous" | "authenticated",
   fingerprint, profile? }`. `fingerprint` = first 22 chars of base64url HMAC-SHA256(secret,
   `"identity\0" + uid + "\0" + (tid ?? "")`), or `"anonymous"`. It is opaque, never stored, never in
   telemetry. `profile` has only the exposed fields.
5. **Identity probe.** `GET {endpoint}/identity` (cookies only, no session token) returns the same summary,
   rate-limited like session creation, same CORS rules. The client calls it when the page becomes visible,
   on window focus (at most once per 5 s), when the chat box opens, and from `client.refreshIdentity()`.
6. **Client reset** on `IDENTITY_CHANGED` or a probe fingerprint different from the session's: abort the
   in-flight stream and ignore any of its late events (a session generation counter); clear messages,
   interim transcript, pending confirmation, pending UI actions and speech output; remove the stored
   session from `sessionStorage`; open a new session lazily; emit `identity` with the new summary.
   **No history ever moves between identities** in this release: login starts a fresh conversation.
   (A later opt-in migration would need its own ADR.)
7. **No client identity input.** No request schema gains a user id, role, email or name. Unknown body
   keys stay rejected or ignored as today.

## Alternatives rejected

- Server-side session revocation list: needs shared state; re-resolving per request already revokes.
- Pushing logout from the host app only: unreliable; the probe and per-request check cover it.
- Carrying anonymous history into the account: silent merge of data across identities.

## Consequences

One extra `resolveUser` call per probe (cheap, cookie-based). Older clients see `IDENTITY_CHANGED` as an
unknown error; the umbrella package keeps client and server versions together.

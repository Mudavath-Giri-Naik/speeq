# REPORT 022 — Identity lifecycle and account isolation

Status: DONE (built by the architect; Codex unavailable)
Branch / last commit: task/022-identity-lifecycle / see `git log`
Verify: lint ✅ · typecheck ✅ · tests 939/0 (baseline 905) · build ✅
Files: created `server/src/handler/identity.ts`, `client/src/identity.ts`, `server/test/identity-lifecycle.test.ts`,
`client/test/identity.test.ts`, `react/test/identity.test.tsx`, `.changeset/identity-lifecycle.md`; modified core
errors, context, http and audit schemas, store helpers; server config, resolve, runtime, token, session, router;
client session, client, types, index, tsup wire list; react hooks and index; both stores; store contract; telemetry
privacy test; demo UI test mock; reference docs (errors, protocol, server config, client, react); ADR-0022.

What I did:
- v2 session tokens with tenant, `IDENTITY_CHANGED` / `AUTH_UNAVAILABLE`, strict `authenticate` (architect commit).
- `identity` summary in `POST /session` and new `GET /identity` (cookies only, no store writes, own rate limit).
- `identity.expose` (displayName, preferredName, locale) with cleaning (control chars, line separators, 80 chars).
- Tenant stored per session in both stores, `SessionFilter.tenantId`, contract test incl. pre-0.12 records.
- Client: full reset on identity change (stream, transcript, confirmation, UI action, call, speech, stored session);
  a new user message is re-sent once in a fresh session, confirmations and UI results are never replayed.
- Client checks identity on focus/visibility (5 s throttle) once a conversation exists; `refreshIdentity()`,
  `snapshot.identity`, `identity` event; React `useSpeeqIdentity()`.
- Telemetry contract extended with tenant, profile, fingerprint canaries and field names.

Deviations from the brief:
- Non-GET `/identity` answers 404 like every other unmatched route (the router has no 405).
- Identity probe has its own limiter (max(30, 3 × sessionsPerMinute)) instead of sharing session creation's, so
  focus checks can never block session creation.
- `UseSpeeqResult` gained `refreshIdentity` (code that hand-builds that type must add it; demo test updated).

Decisions I had to make (please review):
- Turn retry after `IDENTITY_CHANGED` keeps the user's latest message (it was typed by the new identity).
- ADR-0022 wording fixed: the signed token still carries uid/tid (signed, not encrypted), as before.

Risks / unsure about: speech endpoints share `authenticate` but have no dedicated identity test (no speech
providers in the server test helper); covered by the shared code path.
Open questions: none

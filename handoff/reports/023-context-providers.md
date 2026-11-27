# REPORT 023 — Context providers and page context allow-list

Status: DONE (built by the architect)
Verify: lint ✅ · typecheck ✅ · tests 967/0 · build ✅
Files: created `core/src/utils/sensitive.ts`, `server/src/context/{define,project,run,page}.ts`, tests
`server/test/context-providers.test.ts`, `client/test/context.test.ts`, `core/test/sensitive.test.ts`, guide
`docs/guides/customer-context.md`, changeset; modified core utils index, compiler sensitive-names (re-export),
server config/resolve/index, agent tools/loop/prompt, turn/session/ui handlers, client context, telemetry
privacy test, demo config (allow-list `questionId`), server-config reference, ADR-0023.

What I did:

- `defineContext` with category, auth (default required), load (default on-demand), output schema, expose paths,
  extra sensitive names, greeting fields, item/char/time limits; config validation with clear messages.
- Pipeline: sign-in check → per-request budget → timeout → schema → allow-list projection → restricted-name and
  secret-value screen → array/char bounds; request-scoped cache keyed by the Request object.
- Built-in `get_context { source }` (strict schema: no user or record arguments); results stored as a placeholder.
- Initial sources rendered as data blocks; prompt layering: trusted → identity/profile → customer → page → safety.
- Page context: allow-list, byte budget, `store: keys|full|none`, path redaction on client and server; legacy
  configs keep data (screened) with a one-time warning; resumes drop "[not stored]" placeholders.
- `isSensitiveName` now lives in core and the compiler re-exports it (no drift).

Deviations: no new error codes; context failures use `UNAUTHENTICATED`, `TOOL_TIMEOUT`, `TOOL_ERROR`,
`RATE_LIMITED` (ADR-0023 updated). Dropped page keys are not counted in the audit record (no schema change).
Decisions: `remember_preference` reserved as a built-in name now (used by 025). Path redaction also applies to
legacy configs (pure safety). Data blocks escape `<`/`>` as HTML entities.
Risks: initial sources add latency to every message; default `maxInitial` 2 and 1.5 s timeout bound it.
Open questions: none

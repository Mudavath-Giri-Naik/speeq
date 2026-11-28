# REPORT 026 — Discovery: auth bindings, customer data sources, business facts

Status: DONE (built by the architect)
Verify: lint ✅ · typecheck ✅ · tests 1051/0 · build ✅
Files: created `compiler/src/personalize/{index,auth,sources,business}.ts`, `integrate/src/personal.ts`, tests
`compiler/test/personalize.test.ts`, `integrate/test/personal.test.ts`, changeset; modified compiler and
integrate index exports, `docs/reference/compiler-supported-patterns.md`.

What I did:

- `discoverPersonalization({ root, appDir?, manifest })`: auth candidates with levels, entry points, evidence,
  notes and login routes; data source candidates from GET endpoints; business facts with evidence.
- Only files whose text hints at auth, candidate endpoint files and the root layout are parsed.
- `renderIdentity(entry, file, { profile })` for Auth.js, NextAuth v4, Supabase, Clerk, Better Auth.
- `contextSpec` (refusals: requires-binding, no-fields, sensitive-field, unknown-field, auth-not-reviewed,
  invalid-id) and `renderContext` (bindEndpoint with forwardAuth, 1.5 s timeout, z.unknown(), expose list).
- `authStatus` maps discovery levels to terminal statuses; `generated`/`verified` are set by 027/028.

Deviations: discovery is not part of `scan` (keeps the warm-scan contract); wiring the generated files into
`speeq.config.ts` and setup.json decisions is task 027 (agent settings module, ADR-0024 decision 2).
Decisions: Auth.js id falls back to the email (internal isolation key only); Clerk profile name costs one
`currentUser()` call, skipped with `profile: false`.
Risks: response fields come only from literal `json({...})` objects; other shapes show no fields and the
developer types them (unknown-field check is skipped when none were found).
Open questions: none

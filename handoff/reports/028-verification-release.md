# REPORT 028 — Verification, doctor, scenarios A to D, benchmarks, docs, release prep

Status: DONE (built by the architect)
Verify: lint ✅ · typecheck ✅ · tests 1078/0 · build ✅ · packed tarball test PASS
Files: created `integrate/src/verify-personal.ts`, tests `integrate/test/{verify-personal,live-store}.test.ts`,
`server/test/scenarios.test.ts`, `server/scripts/bench-personalisation.ts`, `docs/guides/personalisation.md`,
docs site pages `guides/{control-center,personalisation,customer-context,greetings,memory}.md`,
`docs/maintainers/release-0.12-report.md`, changeset; modified integrate verify, index, package.json (store-mongodb
dependency, mongodb test devDependencies), chat box template, cli verify (`--live-store`), args, types, mongo
helper exports, `scripts/{deps-rules.ts,pack-cli-test.sh}`, docs site nav, `docs/reference/cli.md`, README.

What I did:

- P1 to P5 static checks, RP1 to RP3 runtime checks with the app's settings and a test user, L1 live MongoDB
  round trip in temporary collections (`speeq verify --live-store`); `doctor` shows the static ones.
- Scenarios A to D end to end through the handler with scripted models and in-memory app services.
- Benchmark plain versus personalised (numbers in the release report).
- Packed test extended with personalised settings, type check, `setup --json`, verify RP3 and rollback.
- Docs: terminal-first personalisation guide with Auth.js, NextAuth v4, Supabase, Clerk and Better Auth examples,
  upgrade, disabling, privacy, troubleshooting; five new docs site pages; README quickstart.

Deviations: discovery for apps A to D is covered by the inline fixtures in `compiler/test/personalize.test.ts`
rather than new fixture directories. No live demonstration against SwaSeekh or real providers (owner step).
Decisions: `verify` stays read-only, so `persistence-verified` is not written by `--live-store`; the doctor keeps
warning until the store status is set (setup section 10 records `connection-verified`).
Risks: fixed a 0.11 bug found by the packed test: the generated chat box passed a `getContext` of the wrong
shape, failing strict type checks in host apps.
Open questions: none

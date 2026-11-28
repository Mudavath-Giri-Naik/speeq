# TASK 028 — Verification, doctor, scenarios A to D, benchmarks, docs, release prep

Branch: task/028-verification-release (from main at 991ef6a)

## 1. Read first

Spec sections 40 to 52, release plan §6, reports 022 to 027, `integrate/src/verify.ts`, `cli/src/commands/verify.ts`,
`scripts/pack-cli-test.sh`, `apps/docs/content/nav.ts`.

## 2. Goal

The release can be trusted and published: verify and doctor check the new features honestly, the four
representative scenarios run end to end, overhead is measured, the docs explain the terminal-first flow, and
the packed packages work in a clean external Next.js app with personalised settings.

## 3. Decisions

- Static checks P1 to P5 (wiring, sign-in binding, cross-session memory, storage, context sources); runtime
  checks RP1 to RP3 with the app's settings, a mock model, an in-memory store and a header test user, never the
  app's sign-in, endpoints or database; `--live-store` (L1, host level) runs RP1 and RP3 in the developer's
  MongoDB in fresh `speeq_verify_<run>_*` collections, dropped afterwards. `verify` stays read-only.
- Scenarios A to D run through the HTTP handler with scripted models and in-memory app services.
- Benchmark: plain versus personalised, same mock conditions, numbers recorded as measured.
- Packed test: after init, save personalised settings through the packed `@speeq/integrate`, type-check,
  `setup --json`, verify, roll back.
- Docs: personalisation guide (auth examples, upgrade, disabling, privacy, troubleshooting), control center,
  memory, customer context and greetings on the docs site; release report.

## 7. Tests required

P checks (0.11 project skips, unwired fails, binding moved fails, Mongo URI missing fails, unverified warns,
memory without sign-in warns); RP checks pass with settings and never use an unexposed name; live store passes
and leaves only the developer's collections; scenarios A to D; docs content tests.

## 8. Acceptance

`scripts/verify.sh` passes; `scripts/pack-all.sh && scripts/pack-cli-test.sh` prints PASS.

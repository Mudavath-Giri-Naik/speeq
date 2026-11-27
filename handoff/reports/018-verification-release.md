# REPORT 018 — Verification, doctor, real-app validation, release

Status: DONE
Branch / last commit: task/018-verification-release / see git log
Verify: see "Evidence" (full `scripts/verify.sh` once at the end)

Built by the architect directly (builder agent unavailable). Not independently reviewed.

## What exists

- `@speeq/integrate`: `verifyProject` (static S1 to S10, runtime R1 to R7, host H1), `sandbox.ts` (generated
  files evaluated in `node:vm` with host imports stubbed), `IntegrationPlan.toolSpecs`.
- `@speeq/cli`: real `doctor` and `verify` (`--json`, `--run-host`, exit 0/1/3/4/2), `main()` split out of `bin`.
- `speeq` umbrella: `bin: speeq` shim (Node 22.12 check, then `@speeq/cli`); CLI, integrate and compiler are
  publishable at the lockstep version; changeset added.
- `scripts/pack-cli-test.sh` (clean Next app, packed tarballs), `fixtures/real-apps.json`,
  `pnpm --filter @speeq/cli validate:real`, `docs/maintainers/{phase-1-report.md,real-app-results.json}`,
  CLI reference updated.
- Compiler fix found by the real apps: re-exported destructured handlers (Auth.js) now report `SQ0270`.

## Evidence

Gate table with commands and numbers: `docs/maintainers/phase-1-report.md`. Summary: fixtures eval 100% (21
fixtures); 6 real apps (5 MIT, 1 Apache-2.0) scan, init, repeat init (no-op), verify runtime pass, rollback
restores the tree; packed-tarball test passes; SDK `pack-test.sh` still passes.

## Decisions I had to make (please review)

- Runtime verification evaluates owned generated files with stubbed host imports instead of importing
  host code, so it stays inside ADR-0016 point 8. Edited or foreign files are skipped, never run.
- A level where every check was skipped reports `not-run`, not `pass`.
- Static S2 (stale manifest) and S4 (generated files out of date) are failures (exit 1); pending or stale
  approvals are exit 3.
- Install size: kept `@speeq/cli` as a regular dependency (24.75 MB of 33.08 MB, mostly TypeScript).
  The ADR fallback was not used because it cannot be tested before publishing. **Owner to confirm.**
- `integrate` lost its `speeq` devDependency (it caused a build cycle with the umbrella); the generated-code
  type-check test maps `speeq/*` by path instead. Deps rules: umbrella may depend on and import `@speeq/cli`;
  integrate may depend on server, store-memory, testing and zod.
- The real-app script lives in `packages/cli/scripts/` (needs the workspace packages), not `scripts/`.
- `platforms` was dropped (no LICENSE file); the script rejects unreadable licences.
- Child process output of `exec` now goes to stderr (keeps `--json` clean); Windows runs commands as a
  single string for plain tokens only (avoids DEP0190).

## Risks and open items

- `SPEEQ_PACKAGE_VERSION` must be bumped with the lockstep version (a test fails otherwise).
- Registry-level `npx speeq init` is testable only after the first publish.
- Host level was not run on real apps (not installed); it ran in the tarball app.
- Real-app accuracy uses a simple independent baseline; it does not prove coverage of every pattern.

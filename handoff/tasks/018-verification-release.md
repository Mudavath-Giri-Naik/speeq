# TASK 018 — Verification, doctor, real-app validation, release

Branch: task/018-verification-release (from main at f422dd7)

## 1. Read first

`docs/maintainers/master-plan.md` §5 (Phase 1 gate), §7; ADR-0014 (bin, size fallback), ADR-0016 (point 8:
host code runs only with `--run-host`); reports 016 and 017; `packages/cli/src/run.ts` (stubs to replace),
`packages/integrate/src/{plan,owned,render}.ts`.

## 2. Goal

`speeq doctor` and `speeq verify` report readiness at three separate levels. `npx speeq init` works from a
packed tarball. Three real external Next.js apps are scanned, initialised and verified in temporary copies and
the measured results are recorded. Every Phase 1 gate item has evidence in `docs/maintainers/phase-1-report.md`.

## 3. Decisions already made

- Readiness levels are never merged: **static** (files, manifest, decisions, config, env, deps), **runtime**
  (mock-LLM smoke and permission tests, no host code executed), **host** (the app's own commands, only with
  `--run-host`). Not claimed anywhere: live provider verified, production ready.
- Runtime level never imports host code. It loads the **owned** `.speeq/generated/{tools,routes}.ts`
  (hash verified) by transpiling with TypeScript and running in `node:vm` with a stub `require`: host imports
  resolve to stubs that count calls, `bindEndpoint` is a stub, `speeq/server` and `zod` are the real packages.
  If a generated file is not owned (edited or foreign) its runtime tests are `skip`, never run.
- Verification lives in `@speeq/integrate` (ADR-0014 point 1); the CLI only prints it. Integrate may import
  `@speeq/server`, `@speeq/testing`, `@speeq/store-memory`, `zod` (dev-time depends on runtime, never the reverse).
- Checks have stable ids. Status `pass|fail|warn|skip`. `fail` => exit 1. No fail but stale, pending or
  invalid review state => exit 3. Unsupported project => 4 (from `load`). Usage => 2. Else 0.
- `doctor` = environment + static level. `verify` = static + runtime (+ host with `--run-host`).
- Env var names are read from process env and `.env*` files; values are never stored or printed.
- Host level runs one command: the app's `typecheck` script, else `tsc --noEmit` when TypeScript and a tsconfig
  exist, else `skip`. Through the injected `exec`. Failure => `fail`.
- Umbrella: `bin: speeq` shim importing `@speeq/cli/bin`. `@speeq/cli`, `integrate`, `compiler` become publishable
  (not private) at the lockstep version. Install size is measured; if the delta is unacceptable, use the ADR-0014
  fallback and record why.
- Real apps: pinned revisions in `fixtures/real-apps.json`, licence read from the cloned LICENSE, temporary
  copies, no `--install`, originals never touched. Accuracy is measured against an **independent** filesystem
  baseline (page, route, `"use server"` files and exported HTTP methods counted without the compiler), plus a
  manual spot check. No numbers are written by hand.

## 4. Scope

Create: `packages/integrate/src/{verify,sandbox}.ts`, `packages/integrate/test/verify.test.ts`,
`packages/cli/src/commands/verify.ts`, `packages/speeq/src/bin.ts`, `fixtures/real-apps.json`,
`scripts/{validate-real-apps,pack-test}.ts`, `docs/guides/cli-quickstart.md` (or the existing docs location),
`docs/maintainers/phase-1-report.md`, a changeset, report 018.
Modify: `integrate` index and package.json, `cli` args/run/types/package.json/tsup, `speeq` package.json and tsup,
`scripts/deps-rules.ts`, `docs/reference/cli.md`, `handoff/INDEX.md`.
Do NOT touch: compiler, core schemas, runtime package behaviour.

## 5. Requirements

1. `verifyProject(opts)` returns `VerifyReport` (contract below). Static checks: S1 owned files unedited, S2 manifest
   fresh, S3 decisions valid, S4 generated files match the plan, S5 config exports `speeq`, S6 config uses the
   generated files, S7 handler present (App Router), S8 env names set, S9 dependencies present, S10 review state.
2. Runtime checks: R1 generated tools and routes load, R2 `createSpeeq` accepts them, R3 mock conversation answers,
   R4 every write tool requests confirmation and does not run before approval (denied: not run, approved: run once),
   R5 every auth-guarded tool is blocked for an anonymous user and for a user without the role, allowed with it,
   R6 audit routes return 404 without `authorize`, R7 a tool with `noConfirm` is reported as `warn`.
3. `speeq doctor|verify [--json] [--run-host]`, exit codes as above, human output groups by level.
4. Repeated `init` stays an empty plan; verify never writes.
5. Umbrella shim, size measurement, packed-tarball script, docs, changeset.
6. Real-app script and report with measured accuracy and timing; gate section filled with evidence.

## 6. Contracts

```ts
export type Level = "static" | "runtime" | "host";
export interface Check { id: string; level: Level; status: "pass"|"fail"|"warn"|"skip"; title: string; detail?: string; fix?: string }
export interface VerifyReport { speeq: 1; levels: Record<Level, "pass"|"fail"|"not-run">; checks: Check[]; ok: boolean; reviewPending: boolean }
export function verifyProject(o: { fs: ProjectFs; loaded: LoadedLike; levels: Level[]; env: Record<string,string|undefined>; exec?: ... }): Promise<VerifyReport>
```
JSON: `{ speeq:1, command, ok, exitCode, errors, readiness: {static,runtime,host}, checks:[...] }`.

## 7. Tests

Clean init then verify: static+runtime pass. Edited tools.ts => S1 fail, runtime skipped, exit 1. Foreign (marker removed)
=> not run, warn. Missing config export, missing deps, stale manifest, invalid decisions each fail the right check. Write
tool never executes before approval and not after denial. Anonymous blocked on auth tool, wrong role forbidden, right role
allowed. `noConfirm` => warn. Pending capability => exit 3 with no fail. `--run-host` without exec => skip; exec failure
=> host fail; without the flag host is `not-run` and exec is never called. No file is written by verify. Env values never
appear in output. Usage error exit 2, unsupported project exit 4. Sandbox: host import counted, no real module resolved.

## 8. Acceptance

`scripts/verify.sh` passes; pack test passes in a clean Next app; three real apps in report; every gate item evidenced.

## 9. Finish

Commits per milestone, no attribution. Report `handoff/reports/018-verification-release.md`. Merge to main and push
only after the gate passes.

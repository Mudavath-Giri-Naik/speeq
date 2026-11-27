# Phase 1 report: the compiler, the CLI and verification

Date: 2026-11-27. Tasks 015 to 018. Every number below was produced by a command in this repository
and can be reproduced; nothing is estimated. Raw per-app results: `docs/maintainers/real-app-results.json`.

Machine: Windows 11 (10.0.26300), Intel Core i5-11320H (8 logical cores), 8 GB RAM, Node.js 24.15.0.
Timings are wall-clock on this laptop, single run each, so treat them as orders of magnitude.

## Gate (master plan section 5)

| Gate item                                              | Result | Evidence                                                                                                                                                                       |
| ------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ground-truth fixtures 100% on supported contracts      | PASS   | `pnpm --filter @speeq/compiler eval`: 21 fixtures, every precision and recall row 100%, exit 0                                                                                 |
| At least three real external Next.js apps, with verify | PASS   | 6 apps, pinned revisions, licences read (5 MIT, 1 Apache-2.0), see below                                                                                                       |
| `npx speeq init` works from a packed tarball           | PASS   | `bash scripts/pack-all.sh && bash scripts/pack-cli-test.sh`: clean Next.js app, `npx speeq` from the tarballs, PASS (about 75 s including `npm install`)                       |
| Repeated init is a no-op                               | PASS   | tarball app and 6 of 6 real apps: second `init` applied nothing and the file tree hash was identical                                                                           |
| Rollback restores owned files                          | PASS   | tarball app and 6 of 6 real apps: tree hash after `rollback` equals the tree hash before `init`                                                                                |
| Security matrix passes                                 | PASS   | table below                                                                                                                                                                    |
| Current SDK tests still pass                           | PASS   | `scripts/verify.sh`: lint, typecheck, build pass, 734 tests pass, 0 fail; `scripts/pack-test.sh` (packed SDK in a clean app, type-check and mock turn) passes after the change |
| Measured numbers, not estimates                        | PASS   | sections below                                                                                                                                                                 |

## Real external apps

Apps are in `fixtures/real-apps.json` (repository, 40-character revision). The script
`pnpm --filter @speeq/cli validate:real` fetches each revision into a cache, copies it to a temporary
directory, runs everything there, and checks that the cached upstream tree hash is unchanged afterwards.
`platforms` (vercel) was dropped because the repository has no LICENSE file; the script refuses any app
whose licence it cannot read as MIT, Apache-2.0 or BSD.

Accuracy is measured against an **independent baseline** that does not use the compiler: pages, route
handler methods and `"use server"` exported functions are counted directly from the files. Each cell is
matched / baseline (items the compiler found in total).

| App                          | Rev     | Licence    | Scan   | Caps | Routes     | Endpoints  | Server actions | Init   | Verify (static / runtime) |
| ---------------------------- | ------- | ---------- | ------ | ---- | ---------- | ---------- | -------------- | ------ | ------------------------- |
| saas-starter                 | 6e33e58 | MIT        | 227 ms | 22   | 8/8 (8)    | 4/4 (4)    | 1/1 (1)        | 206 ms | fail S9 / pass            |
| commerce                     | f7521d5 | MIT        | 193 ms | 18   | 5/5 (5)    | 1/1 (1)    | 5/5 (5)        | 187 ms | fail S9 / pass            |
| taxonomy                     | 298a885 | MIT        | 615 ms | 28   | 14/14 (14) | 8/8 (8)    | 0/0 (0)        | 654 ms | fail S9 / pass            |
| nextjs-subscription-payments | bdd0813 | MIT        | 260 ms | 27   | 4/4 (4)    | 3/3 (3)    | 11/11 (11)     | 261 ms | fail S9 / pass            |
| next-saas-stripe-starter     | c6df229 | MIT        | 660 ms | 31   | 23/23 (23) | 3/3 (3)    | 3/3 (3)        | 424 ms | fail S9 / pass            |
| ai-chatbot                   | a8989b5 | Apache-2.0 | 775 ms | 26   | 4/4 (4)    | 15/15 (15) | 6/6 (6)        | 509 ms | fail S9 / pass            |

- Static `fail S9` is expected and honest: the apps were never installed, so `speeq` (and `zod` in two) is
  not declared. Every other static check passes. The runtime level (mock conversation, confirmation,
  auth guards, audit 404) passed on all 6 apps, with 5 to 24 capabilities approved per app (2 to 18 wrapped)
  so the generated wrappers were exercised on real code. Approved functions and endpoints used `--access read`
  and `--auth authenticated` only to drive the pipeline; this is a pipeline test, not a security review of
  those apps.
- `init` exit codes: 0 for three apps, 3 (capabilities still waiting for review) for three. Verify 0.2 to
  1.0 s per app, including the mock conversation.
- Skips were all explained: `Blocked: sensitive-not-allowed` (sensitive paths need `allowSensitive`) and
  `The input is not an object schema`. Nothing was wrapped silently.
- **A real gap was found and fixed.** In ai-chatbot the Auth.js route
  (`export { GET, POST } from "@/app/(auth)/auth"`, a re-export of a destructured value) produced no
  endpoint and no diagnostic, which breaks "unsupported patterns are reported, not guessed". The compiler
  now reports `SQ0270` for a method name that is exported but cannot be resolved to a handler; a fixture
  (`unsupported-dynamic`) covers it and the real app now reports it.
- Limits of this evidence: the baseline counts the obvious patterns, so it proves the compiler does not
  miss or invent those; it is not a proof for every pattern. The host level (`--run-host`) was not run on
  the real apps because they were not installed; it was run in the packed-tarball app, where `tsc`
  also passed on the generated files. Incremental scan and memory beyond one RSS sample (RSS 155 to 303 MB after
  the scan, in a process that had already scanned earlier apps) were not re-measured on real apps; see `compiler-benchmark.md`.

## Packed tarball

`scripts/pack-all.sh` builds and packs all 14 publishable packages (the CLI, integration engine and
compiler are now publishable). `scripts/pack-cli-test.sh` installs the tarballs in a clean Next.js 16
app (overrides map every workspace package to its tarball) and runs the real executable:
`--version`, `scan`, `capabilities enable` x3, `init --ci` (1.9 to 2.4 s over three runs, applied), a second `init` (no-op,
file hashes identical), `verify` (static pass, runtime pass), `tsc --noEmit` (the generated code compiles
against the installed packages), `verify --run-host` (host pass) and `rollback` (tree identical to before
`init`). Registry download of `speeq` itself cannot be tested before publishing; the tarball install is
the same code path through `npm`.

## Install size (ADR-0014 point 6)

Installing the packed `speeq` and `zod` alone in an empty project (24 packages): **33.08 MB** unpacked.
Of that, the dev-time packages and their dependencies are **24.75 MB**, of which TypeScript is 23.22 MB;
the SDK part is about 8.3 MB. Decision: keep `@speeq/cli` as a regular dependency of `speeq`.
Reasons: the only apps that import `speeq` are TypeScript Next.js apps that already install TypeScript,
nothing in the SDK entry points imports the CLI, compiler or TypeScript (a deployed app's traced bundle
is unchanged), and the alternative (a lazily fetched CLI) cannot be tested before publishing. If install
size draws complaints the ADR fallback (optional CLI with a shim that prints one instruction) stays
available. **This is a judgement call for the owner**: a 4x install size for SDK-only users is real.

## Security matrix (master plan section 6)

| Threat                         | Control and the test that proves it                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Path traversal, symlinks       | `compiler/test/fs.test.ts`, `security.test.ts` ("rejects app directories outside", "does not follow a linked app directory"); `integrate/test/units.test.ts` (nodeFs rejects unsafe paths and symlink escapes)           |
| Secret exposure                | `security.test.ts` ("keeps secrets and planted instructions out of every output"); verify never stores env values (`verify.test.ts`, "values are never reported")                                                        |
| Code execution during scan     | `security.test.ts` ("never executes repository code", "uses only read operations and no process or network APIs"). Runtime verification runs only hash-verified generated files with host imports stubbed (`sandbox.ts`) |
| Resource exhaustion            | `security.test.ts` (pathological sources, deadline)                                                                                                                                                                      |
| Prompt injection in comments   | `security.test.ts` (planted instructions absent from output)                                                                                                                                                             |
| Unsafe generated code          | `units.test.ts` ("never embeds injected text as code"), `engine.test.ts` ("refuses to write generated source that does not parse"), `typecheck.test.ts`, and `tsc` in the tarball test                                   |
| Overwriting developer files    | `engine.test.ts` (hand-edited file never overwritten, marker removal hands over ownership, config and layout never edited, rollback skips files changed since); real apps and tarball: rollback restores the tree        |
| Silent privilege grant         | `engine.test.ts` (credentials never wrapped, unknown access skipped, fingerprint change stops execution); `verify` S10 and exit 3                                                                                        |
| Arbitrary URL or request tools | `server/test/endpoint.test.ts` (41 tests: same origin, no redirects, size cap, timeout, no credentials unless `forwardAuth`)                                                                                             |
| Supply chain                   | `cli.test.ts` ("installs dependencies only on request, with exact versions and no scripts")                                                                                                                              |
| New in 018                     | `verify.test.ts`: write tools do not run before approval or after denial, anonymous and wrong-role users blocked, a guard or confirmation removed from the generated code is detected, audit 404 without `authorize`     |

## Verification methodology notes

- `speeq verify` is three separate levels (static, runtime, host). Nothing reports "live provider verified"
  or "production ready", and a level that did not run says `not-run`, never `pass`.
- The runtime level evaluates the generated `tools.ts` and `routes.ts` (only if the ownership hash matches)
  in a `node:vm` context with a stub `require`. The sandbox is not a security boundary; the guarantee is
  that no host module is ever resolved and no request is made.
- Time to first mock conversation: `verify` (static and runtime, includes the mock conversation) took
  0.2 to 1.0 s on the six real apps.

## Open items

1. `SPEEQ_PACKAGE_VERSION` (`packages/cli/src/version.ts`) is checked against `packages/speeq/package.json`
   by a test. When `changeset version` bumps the lockstep group the constant must be bumped in the same
   commit.
2. Registry-level install was tested on 2026-11-27 with `speeq@0.6.0` from npm (`next` tag) in a clean Next.js app: `speeq --version`, `scan`, `capabilities enable`, `init`, a second `init` (no-op), `verify` (static pass, runtime pass), `tsc --noEmit`, `verify --run-host` (pass) and `rollback` (tree identical) all passed. Plain `npx speeq` still resolves the `latest` tag (0.2.0, no executable) until `latest` is moved to 0.6.0.
3. Pages Router projects get guidance, not an automatic handler; MongoDB is not detected.
4. The install-size decision above.

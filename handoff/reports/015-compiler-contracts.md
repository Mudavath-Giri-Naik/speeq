# REPORT 015 — Compiler foundation

**Status** DONE  
**Branch** `task/015-compiler-contracts` at `5c7d03d` before this report  
**Verify** Lint, typecheck and build passed. Tests recorded 529 passed, 0 failed and 1 skipped.

## Files

36 created, 11 modified, 0 deleted across task 015 commits, including this report.

- `packages/compiler/**`, `fixtures/compiler/**`, `docs/maintainers/compiler-research.md`
- `packages/core/{package.json,tsup.config.ts,src/manifest.ts,src/schemas/{manifest,status}.ts,test/{manifest,status}.test.ts}`
- `scripts/{deps-rules,check-deps-direction,check-deps-direction.test}.ts`, `biome.json`, `pnpm-lock.yaml`
- `docs/maintainers/master-plan.md`, `handoff/tasks/{015-compiler-contracts,016-compiler-discovery}.md`
- `handoff/INDEX.md`, `handoff/reports/015-compiler-contracts.md`

## What I did

- Added strict manifest and decisions parsers and tested the ADR-0015 execution matrix. Verified the dedicated subpath from source, built ESM and built CommonJS.
- Added the private compiler package, read-only repository access, identity and fingerprint helpers, adapter contracts, and a diagnostic registry.
- Added three labelled fixtures and the scorer. The empty discovery stub exited 1 with 0% route recall on App Router and Pages Router. The hostile fixture also exposes its missing oversized-file diagnostic.
- Recorded parser timings, RSS, package sizes and licences. ts-morph parsed the TSX sample with bundled TS 6.0.2, and repo TS 6.0.3 recognized its SourceFile. ADR-0013 remains in effect.

## Deviations from the brief

- Updated the lockfile for frozen installs and the dependency checker to enforce the umbrella restriction. Applied the authorized Markdown formatting fixes.
- Based the branch on fetched main `3077990` and carried over the local brief commit. Preserved concurrent task 016 documentation commits `17c325b` and `ccffba7`.

## Decisions I had to make

- IDs accept a recognized kind and a nonempty printable key. Ordering uses lexical comparison. The project root may be `.`.
- Headline precedence follows the contract’s listed order. Only an approved fingerprint mismatch is stale. Verification remains an independent dimension.
- The inventory cap counts encountered files, including denied names. Ignored directories are pruned. Direct reads also enforce ignore rules and the byte limit.
- Scoring uses a current approval and bound context without access or sensitivity overrides. Empty denominators score 100%. Each reported evidence location must match a label for that ID.

## Risks / unsure about

Windows denied file-symlink creation, so that test skipped. The directory-link test passed with a junction. The hostile fixture uses the documented text placeholder. The ts-morph probe measured one TSX sample.

## Open questions

None.

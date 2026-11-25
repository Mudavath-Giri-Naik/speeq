# Report 010 — Umbrella SDK and release workflow

**Status** PARTIAL. The release gate is blocked by repository formatting. Default npm peer resolution also conflicts with the optional-install requirement.

**Branch / implementation** `task/010-umbrella-release` / `941266b`, based on `main` at `3c1f8f9`.

**Verification** `bash scripts/verify.sh` exited 1. Lint failed on the two tables below. Typecheck passed (56s), all 334 tests passed (60s), and build passed (48s). The unchanged telemetry privacy suite passed all 14 tests.

**Files** 25 created, 15 modified, 0 deleted, including this report.

```text
packages/speeq/{LICENSE,README.md,package.json,tsconfig.json,tsup.config.ts,vitest.config.ts,src/*.ts,test/exports.test.ts}
packages/server/{src/config.ts,src/index.ts,src/update-check.ts,test/update-check.test.ts}
scripts/{check-deps-direction.ts,check-deps-direction.test.ts,pack-all.sh,pack-test.sh}
.changeset/{config.json,umbrella-release.md}, .github/workflows/release.yml, pnpm-lock.yaml
README.md, CONTRIBUTING.md, llms.txt, docs/{concepts/privacy.md,guides/nextjs.md,reference/environment.md,reference/server-config.md,maintainers/releasing.md,decisions/0010-dev-update-notice.md}
handoff/reports/010-umbrella-release.md
```

**What I did**

- Built 11 pure re-export entry points. Tested native ESM and CJS export parity and isolated browser entries, including declarations. The MongoDB build links its driver directly so Node reports a missing peer.
- Added the once-per-process development update check, boolean configuration validation, privacy documentation and ADR-0010. All 29 update-check tests passed, including gates, channel selection, a simulated timeout and synchronous handler creation.
- Added the upstream-main-only Version Packages workflow with verification and tarball gates before publishing. `pnpm changeset status` showed a minor bump for all ten packages. `pnpm check-deps` passed.
- `bash scripts/pack-all.sh` produced ten archives, 370,763 bytes total. Sizes in bytes were speeq 5,295, client 70,812, core 97,162, react 12,054, server 130,571, testing 21,518, llm-gemini 9,222, llm-openai-compatible 8,193, store-memory 6,175 and store-mongodb 9,761.
- `bash scripts/pack-test.sh` passed. The scratch Next.js project installed all ten tarballs, type-checked the guide and non-MongoDB entries without a driver, saw the native missing-driver error, and completed a mock turn using `speeq/server` and `speeq/testing`. After `npm i mongodb`, the MongoDB entries type-checked and the umbrella entry loaded.
- `pnpm publish --dry-run --no-git-checks` exited 0 in `packages/speeq`. The archive contained only `dist/`, `README.md`, `package.json` and `LICENSE`. All nine internal dependencies were rewritten to 0.1.0. All 11 ESM, CJS and declaration targets existed.
- Local `actionlint` was unavailable. PyYAML parsed the workflow and assertions verified the main-only trigger, upstream/fork guard and pre-publish gate.

**Deviations and suggested fixes**

- `handoff/INDEX.md:5` and `handoff/tasks/010-umbrella-release.md:24` contain tables that fail `pnpm lint` on the task base. `pnpm lint:fix` formatted both. Restored their original contents to honor scope. Suggested fix for the architect is to run Biome formatting on those two files.
- `packages/react/package.json:56` and `packages/adapters/store-mongodb/package.json:57` declare required peers. In a fresh npm project with only the packed umbrella and Zod as direct dependencies and local tarball overrides, `npm install --ignore-scripts --package-lock-only --no-audit --no-fund` resolved both React and MongoDB. Mark those peers optional in the scoped manifests to meet the default-install requirement.

**Decisions** The scratch app disables automatic peer installation to exercise a genuinely absent MongoDB driver before installing it. The separate default-resolution check above records normal npm behavior.

**Open questions** None. The local `.env.example` remained unstaged. No merge or push.

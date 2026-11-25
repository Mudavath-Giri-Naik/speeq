# REPORT 009 — SDK documentation and release checks

**Status** Part A DONE. Part B pending the architect's “008 is merged” signal.

**Branch / implementation** `task/009-docs-release` / `0cd8d90` (docs), `fe001ef` (pack scripts).

**Verify** `bash scripts/verify.sh` passed without overrides. Lint 2s, typecheck 3s, tests 2s (264 passed, 0 failed), build 1s.

**Files** 35 created, 14 modified, 0 deleted.

```text
README.md, ARCHITECTURE.md, llms.txt, AGENTS.md, CLAUDE.md, CONTRIBUTING.md, SECURITY.md
docs/concepts/*.md, docs/guides/*.md, docs/decisions/0001–0009
docs/reference/{client,environment,errors,protocol,react,server-config}.md
packages/*/README.md, packages/adapters/*/README.md
.gitignore, scripts/{pack-all,pack-test}.sh, handoff/reports/009-docs-release.md
```

**What I did**

- Documented the SDK contracts, host permissions, store-backed confirmations, audit and anonymous telemetry. Checked local documentation links. Corrected the server configuration link and completed the testing README's server example.
- Ran `bash scripts/pack-all.sh` and `KEEP_PACK_TEST=1 bash scripts/pack-test.sh` in Git Bash. Nine tarballs installed outside the repo. The script copied the four guide code blocks verbatim, ran `pnpm install`, `pnpm exec tsc --noEmit` and a Node mock turn using the installed SDK. The final standalone `bash scripts/pack-test.sh` also passed.
- In `/tmp/speeq-pack.BXrkx3wL`, ran `pnpm exec tsc --noEmit` on 17 additional examples using typed stand-ins for host database and identity functions. Then ran `pnpm exec next dev`.
- Used `pnpm --filter @speeq/demo exec node --input-type=module` with Playwright Chromium. Opened the scratch homepage, clicked `getByRole("button", { name: "Say hello" })` and awaited `getByText("Hello from Helper.", { exact: true }).waitFor()`. Session and turn each returned 200.

**Decisions** ADRs 0001–0003 cover the pnpm/Turborepo workspace, headless adapters with store-backed history, and Zod 4 with source exports. ADR-0005 includes HMAC session tokens. Applied the brief's explicit one-line stale-spec correction to both agent instruction files.

**Deviations** None from Part A. A verification run hit memory pressure during simultaneous builds. A later run caught local Markdown line endings. After formatting, the full command passed without overrides.

**Bug for follow-up** `apps/platform/scripts/migrate.ts:2` imports named exports from CommonJS `@next/env`. Running `pnpm --filter @speeq/platform db:migrate` in the clean dashboard worktree fails before opening a database because `loadEnvConfig` is unavailable as a named export. Use a default import and destructure its helpers. The migration script is outside this task.

**Open questions** None.

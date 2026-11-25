# Report 009 — SDK documentation and release checks

**Status** Part A DONE, Part B DONE

**Branch** `task/009-docs-release`

**Release result** Verification completed. The commit-history hygiene check failed on historical commit `324c6ab`.

## Part A

- `0cd8d90` documented the SDK contracts, permissions, confirmations, audit and telemetry. Checked documentation links and corrected the server configuration link and testing README example. `fe001ef` added the pack scripts. Part A changed 49 files (35 created, 14 modified).
- `bash scripts/verify.sh` passed without overrides, including 264 tests. Earlier attempts encountered memory pressure and Markdown line endings.
- `bash scripts/pack-all.sh`, `KEEP_PACK_TEST=1 bash scripts/pack-test.sh` and a standalone `bash scripts/pack-test.sh` passed. The scratch app installed nine tarballs, compiled the four Next.js guide blocks verbatim and completed a mock turn.
- In `/tmp/speeq-pack.BXrkx3wL`, `pnpm exec tsc --noEmit` checked 17 additional examples. With `pnpm exec next dev` running, Chromium clicked “Say hello” and displayed “Hello from Helper.” Session and turn both returned 200.
- ADRs 0001–0003 cover the pnpm/Turborepo workspace, headless adapters with store-backed history, and Zod 4 with source exports. ADR-0005 covers HMAC session tokens. Both agent instruction files received the stale-spec correction.

## Part B

- Reviewed all six documentation files in `d9b3e9e` against §5.2, the platform README, reports 007/008 and the ingest implementation. Clarified the demo configuration file in the platform guide and used that setup for the smoke test.
- `git fetch` passed. `git rebase main` in the original checkout refused the unstaged local credentials file. From the repo root, `git clone --quiet --no-local --branch task/009-docs-release . ../speeq-009-release-1795614729377` created the external verification clone. There, `git branch main origin/main` and `git rebase main` confirmed the task branch at `d9b3e9e` was current with `f195be3`. Copied only the guide clarification into the clone.
- `pnpm install --frozen-lockfile` passed for all 13 workspace projects. The first `scripts/verify.sh` invocation selected WSL, which could not find Node (exit 127 in all four stages). The same command in Git Bash passed without overrides. Lint 5s, typecheck 85s, 280 tests passed in 40s, build 71s.
- `pnpm --filter @speeq/demo exec playwright install chromium` passed. `pnpm test:e2e` passed 1/1, covering navigation, bookmark confirmation and authorized audit history.

### Mock demo and platform

Ran `pnpm dev` with `SPEEQ_LLM=mock` and `SPEEQ_PLATFORM_URL=http://localhost:3001` in the clone’s demo-local settings. In the commands below, `D=http://localhost:3000/api/speeq` and `P=http://localhost:3001`.

- `curl -fsS "$D/health"` and `curl -fsS "$P/api/health"` each returned 200 and `ok: true`. `curl -sS -o /dev/null -w 'dashboard %{http_code} %{redirect_url}\n' "$P/dashboard"` returned 307 to `http://localhost:3001/login`.
- Warmed PGlite through the login form and the ingest route with `curl -sS -o /dev/null -w 'ingest warmup %{http_code}\n' -H 'Content-Type: application/json' -d '{}' "$P/api/v1/ingest"`. The empty batch returned the expected 400.
- `s=$(curl -fsS -H 'Content-Type: application/json' -d '{}' "$D/session")` returned 200. With `id` and `token` from that response, `curl -fsS -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d '{"text":"show pricing","language":"en-IN"}' "$D/session/$id/turn"` returned 200, “Opening Pricing.”, navigation to `/pricing` and a completed turn. The SDK’s batch returned 202.
- After stopping both apps, `pnpm --filter @speeq/platform exec node --input-type=module -e 'import {PGlite} from "@electric-sql/pglite";const db=new PGlite(".data/pglite");console.log((await db.query("select count(distinct i.instance_id) as instances,sum(u.turns) as turns,sum(u.navigations) as navigations from instances i join usage_rollups u using(instance_id)")).rows);await db.close()'` returned one instance, one turn and one navigation before seeding.
- `pnpm --filter @speeq/platform seed` then `pnpm --filter @speeq/platform seed:clear` both exited 0. Repeating the SQL check returned the same demo instance count and totals.

### Packaging and repository hygiene

- `bash scripts/pack-all.sh` produced nine tarballs (356,120 bytes). `bash scripts/pack-test.sh` installed all nine in `/tmp/speeq-pack.mtaYZy2u`. `pnpm exec tsc --noEmit` resolved every public entry point, including `@speeq/server/next`. The Node mock turn through `createSpeeq` and `@speeq/testing` returned “Hello.”
- `pnpm publish --dry-run --no-git-checks` exited 0 in each publishable package directory. Packages checked were client, core, react, server, testing, llm-gemini, llm-openai-compatible, store-memory and store-mongodb, all at 0.1.0.
- `python ../speeq-009-release-1795614729377-audit.py` inspected the nine actual archives. All declared `files` as `dist` and `README.md`, MIT, Node `>=20` and the correct repository URL and directory. All public ESM, CJS and declaration targets existed. The workspace-only `@speeq/source` condition points to unpublished source by design. No archive contained a `src`, test or `.env` file.
- `git ls-files | grep -i "\.env"` listed only `.env.example` and `apps/demo/.env.example`. `git grep -nE "postgres(ql)?://[^[:space:]\"']*:[^@[:space:]\"']+@"` found zero matches in the clean checkout (grep exit 1).
- `git ls-tree -rl HEAD | awk '$4>1000000 && $5!="pnpm-lock.yaml"{print $4,$5}'` found no oversized tracked file. An initial shell invocation lost the awk field references during argument expansion. The quoted Git Bash script ran successfully.
- **Failed** — `git log --format=%B | grep -iE "claude|co-authored-by|generated with"` matched the subject and body of `324c6ab`, which describe repository workflow files. Both matches predate this task. History was left intact.

All requested checks ran. The historical message is the only outstanding failure. The local `.env.example` remained unstaged.

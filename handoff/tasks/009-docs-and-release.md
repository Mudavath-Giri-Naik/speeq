# TASK 009 — Docs pass + release verification (combined: stages 11 and 12)

Branch: task/009-docs-release (already created from `main`; it contains this brief. Check it out, do not create another).

**This task runs in parallel with task 008 (platform dashboard).** It has two parts:

- **Part A (start now):** all documentation and `pack-all`. Touches only docs/root files, never `apps/platform`, so it cannot conflict with 008.
- **Part B (start only when the architect says "008 is merged"):** rebase on `main`, document the dashboard, and run the full release verification. Do **not** start Part B on your own.

## 1. Read first

- `AGENTS.md`, `PLAN.md` (all of it), `handoff/INDEX.md`, every `handoff/reports/*.md` (what each package really exposes; trust the code over the plan if they differ).
- Each package's `src/index.ts`, `package.json`, and existing `README.md`; `docs/reference/telemetry.md` (already written, keep as is unless wrong); `apps/demo/README.md`; `apps/platform/{package.json,README.md if present}`; `SECURITY.md`, `CONTRIBUTING.md`; `.github/workflows/*`; `.changeset/config.json`.
- Note: `docs/SPEC.md` does **not** exist; do not link to it. If `AGENTS.md` or other files still mention it, replace the reference with `PLAN.md` (that one-line fix is in scope).

## 2. Goal

A newcomer can understand what speeq is, install it into a Next.js app, wire voice/text, tools,
knowledge, confirmations, audit and telemetry, and trust the security story, using only the repo
docs. The repo is releasable: clean install, verify, e2e, and tarball install all pass.

## 3. Decisions already made (do NOT change or re-decide)

- **Accuracy over volume.** Every code snippet in the docs must be copied from, or verified against, the real exported API (check `src/index.ts` and the tests; if a snippet is long, compile-check it in a scratch file with `tsc` against the workspace packages). No invented options, no features that do not exist. If something is a known simplification, say so plainly.
- **Style:** plain, direct, short paragraphs; headings in sentence case; no marketing fluff, no emojis; second person for guides. Markdown must pass `pnpm lint` (Biome formats Markdown here; run `pnpm lint:fix`).
- **Do not write** `docs/integration/nextjs-integration-prompt.md`. The architect writes that file himself. Leave it out; link to it from the README as "Integration prompt" only after Part B if the file exists then (otherwise omit the link).
- **No AI attribution** anywhere in docs or commits.
- Never copy values from any local `.env*` file. Use placeholders (`your-secret-here`, `pk_xxxxxxxx`).
- Do not change source code in `packages/**` or `apps/**` except: (a) fixing a **wrong comment or README claim you find**, listed in the report; (b) the `pack-all` script and docs below. If you find a real bug, do **not** fix it silently: list it in the report with a file/line and a repro.

## 4. Part A — deliverables

Create or complete (all paths relative to the repo root):

1. `README.md`: what speeq is (headless voice/text agent for web apps), what is in the monorepo (table of packages), a 10-line quickstart (install, `createSpeeq`, mount the handler, `SpeeqProvider`, `useSpeeq`), the demo (`pnpm dev`, mock mode needs no keys), links to docs, license, status badge-free. Be honest that it is pre-1.0 and published under the `next` tag (see `release` script).
2. `ARCHITECTURE.md`: components and data flow (browser client ↔ HTTP+SSE ↔ server handler ↔ agent loop ↔ LLM adapter / tools / knowledge / store), request lifecycle of one turn and of a confirmation resume, session tokens, where state lives (the store is the history), telemetry path, dependency direction rules (`scripts/check-deps-direction.ts`). Include one diagram in Mermaid or ASCII that renders on GitHub.
3. `docs/concepts/`: `how-it-works.md`, `sessions-and-security.md` (tokens, `resolveUser`, `allowAnonymous`, origins/CORS, rate limits, guardrails, redaction), `confirmations.md` (write tools, risk levels, resume flow, replay protection via dedupe key), `audit.md` (events, retention, `authorize`, redaction), `privacy.md` (what is stored where, what telemetry sends and never sends, how to disable).
4. `docs/guides/`: `nextjs.md` (end-to-end integration: route handler with `createNextHandler`, `waitUntil` via `after`, provider in the layout, navigation with `onNavigate`, page context with `useSpeeqContext`), `tools-and-knowledge.md`, `routes-and-navigation.md`, `stores.md` (memory vs MongoDB, writing a custom store against the contract suite), `llm-providers.md` (OpenAI-compatible/Groq, Gemini, writing your own, mock mode for tests), `testing.md` (`@speeq/testing`), `voice-and-languages.md` (Web Speech support and limits, language/voice caveats, text fallback), `audit-viewer.md` (`useAuditSessions` + authorize), `deployment.md` (env vars, secrets, serverless notes, rate limiter is per instance).
5. `docs/reference/`: `server-config.md` (every `SpeeqConfig` field: type, default, behaviour; derive from `packages/server/src/config.ts`), `protocol.md` (HTTP endpoints, request bodies, SSE event types and fields from `packages/core/src/schemas`), `client.md` (`SpeeqClientOptions`, snapshot, events, methods), `react.md` (provider props, hooks), `errors.md` (every error code: meaning, HTTP status, retryable, what to do), `environment.md` (all env vars across demo/server/platform, which are secrets). Keep `telemetry.md` as is.
6. `docs/decisions/` ADRs, one file each, format: Title, Status (Accepted), Context, Decision, Consequences (short). Existing code/docs reference **ADR-0004 … ADR-0009**; run `git grep -n "ADR-000"` to find each reference and write the ADR for what it refers to. Then write ADR-0001–0003 from `PLAN.md` §3 decisions that have no ADR yet (monorepo + Turborepo/pnpm; headless library + adapters; Zod 4 as peer dependency / `@speeq/source` condition; pick the three most consequential from §3 and say which in the report). Required topics overall: HTTP+SSE web-standard handler (0005), telemetry flush & anonymity (0004), Biome (0006), client zero-dependency bundling (0008), platform database Postgres/PGlite (0009), stateless HMAC session tokens, store-as-history with dedupe-key confirmations.
7. `llms.txt` at the repo root (a concise index for LLM crawlers: one line per doc with a one-sentence description, plus a "key facts" section) and `llms-full.txt` is **not** required.
8. `scripts/pack-all.sh`: for every publishable package (`packages/*`, `packages/adapters/*`, not `private` ones) run `pnpm pack` into `./.packs/` (gitignored) after a build; print the tarball list and sizes; exit non-zero on any failure. Works in Git Bash on Windows and on Linux/macOS. Add `.packs/` to `.gitignore`. Add a short `scripts/pack-test.sh` (see Part B) that installs the tarballs into a throwaway project outside the repo and type-checks a snippet; keep it runnable by anyone.
9. Package READMEs: check each `packages/*/README.md` against the real API and fix inaccuracies; make sure each has install, minimal usage, and a link to the relevant guide/reference.
10. `CONTRIBUTING.md`: confirm commands match reality (`pnpm install`, `scripts/verify.sh`, e2e command, changesets); fix drift.
11. `SECURITY.md`: confirm it lists how to report vulnerabilities and the security model summary (tokens, confirmations, audit redaction, telemetry anonymity, rate-limiter caveat); fix drift. Do not invent a contact address: if none exists, write that private vulnerability reporting through GitHub Security Advisories is the channel.

**Quality bar for Part A:** a reader following `docs/guides/nextjs.md` verbatim in a fresh Next.js app must get a working mock-mode assistant. Verify this by actually doing it in a scratch directory **outside the repo** using the tarballs from `pack-all.sh` (this is also the pack test). Report exactly what you ran.

## 5. Part B — only after "008 is merged"

1. `git fetch`, rebase the branch on `main` (resolve any doc conflicts; there should be none outside `.gitignore`/`README.md`).
2. Document the platform dashboard: `docs/guides/platform.md` (what it is, env vars `DATABASE_URL`, `DATABASE_URL_DIRECT`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `CRON_SECRET`, `GITHUB_REPO`, `TRUST_PROXY_HEADERS`, `TELEMETRY_RETENTION_DAYS`; running with PGlite vs Postgres/Supabase; `db:migrate`; `seed` / `seed:clear`; creating a project key; pointing the SDK at it; ingest limits: 64 KiB, 10 batches/min per instance, 1200/min global; retention cron; login throttle; known limitation: a flood of fake instance ids is bounded only by the global limit and retention), update `docs/reference/environment.md`, `docs/reference/telemetry.md` (add the server-side validation rules section), `llms.txt`, `README.md`, `ARCHITECTURE.md`. Read `apps/platform/README.md` and the 007/008 reports for accuracy.
3. **Release verification** (run each, record command + result in the report):
   - Fresh clone/worktree outside the repo (`git worktree add` or `git clone`), `pnpm install --frozen-lockfile`.
   - `scripts/verify.sh` with no overrides.
   - `pnpm test:e2e` (install the Chromium browser first if needed).
   - Demo in mock mode: start `pnpm dev`, hit the demo and platform (health, one conversation through the API with `curl`, platform `/dashboard` redirects to `/login`), confirm telemetry from the demo creates an instance row in PGlite when `SPEEQ_PLATFORM_URL=http://localhost:3001`. Also run `seed` then `seed:clear`.
   - `bash scripts/pack-all.sh` then `bash scripts/pack-test.sh`: install every tarball into a throwaway Next.js + TypeScript project, type-check an import of each public entry point (including `@speeq/server/next`), and run a mock-mode turn through `createSpeeq` using `@speeq/testing`.
   - `npm publish --dry-run` for each publishable package (or `pnpm publish --dry-run --no-git-checks`): check `files`, `exports`, `types`, `engines`, `license`, `repository`, and that no `src/test/.env` files are in the tarball.
   - Repository hygiene: `git ls-files | grep -i "\.env"` shows only `*.env.example` files; `git grep -nE "postgres(ql)?://[^[:space:]\"']*:[^@[:space:]\"']+@"` finds nothing real; no file over 1 MB tracked besides the lockfile; `git log --format=%B | grep -iE "claude|co-authored-by|generated with"` finds nothing.
   - List anything that failed or was skipped and why. Do not hide failures.
4. If a problem requires a code change, **do not fix it in this task**; write it in the report with file, line, repro and your suggested fix, and stop that item. Docs-only fixes are fine.

## 6. Scope

Create/modify: `README.md`, `ARCHITECTURE.md`, `llms.txt`, `AGENTS.md` (only the `docs/SPEC.md` mention), `CONTRIBUTING.md`, `SECURITY.md`, `docs/**` (except `docs/integration/**`), `packages/*/README.md` and `packages/adapters/*/README.md`, `apps/demo/README.md`, `scripts/pack-all.sh`, `scripts/pack-test.sh`, `.gitignore`, `handoff/reports/009-docs-release.md`.

Do NOT touch: any `src/` or `test/` file, `package.json` files (except none), `apps/platform/**` in Part A, `handoff/INDEX.md`, `.env.example`, `docs/integration/**`.

## 7. Acceptance

- Part A: `scripts/verify.sh` passes with no overrides (Markdown formatting included); `pack-all.sh` produces tarballs for every publishable package; the nextjs guide was followed verbatim in a scratch app and worked in mock mode (describe it in the report).
- Part B: every verification step above is reported with its result.
- `git diff --stat` shows only the files in §6. `.env.example` not staged. No secrets, no copied local env values.

## 8. Finish

Commit on the branch (Conventional Commits, `docs:` / `chore:` types, no attribution lines of any kind,
no Co-Authored-By). Write `handoff/reports/009-docs-release.md` from `handoff/REPORT_TEMPLATE.md`.
After Part A, write the report with Part B marked "pending" and print it, then **stop**. After Part B,
update the same report and print it. Do not merge to main. Do not push. Do not edit `handoff/INDEX.md`.

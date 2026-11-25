# AGENTS.md — shared rules for every agent working on speeq

speeq is an open-source, **headless** conversational-AI framework for web apps: a voice/text agent
that navigates the host app, answers from the developer's own data through developer-defined
tools, and writes a full audit log. A separate platform app collects **anonymous** adoption
counters. See `PLAN.md` for the build plan and `handoff/INDEX.md` for current status.

## Dependency rules (enforced by `scripts/check-deps-direction.ts`)

`core` ← `server`; `core` ← `client` ← `react`; adapters depend only on `core`.
`core` depends only on `zod` (peer). `client` has **no runtime dependencies**: it may import
`@speeq/core/errors`, `@speeq/core/utils` and `import type` from `@speeq/core`, which are bundled
at build time. `testing` depends on `core`. Test files and devDependencies may use anything in the
workspace.

## Commands

```bash
pnpm install          # Node >= 22.12 (.nvmrc), pnpm via corepack
scripts/verify.sh     # lint + typecheck + test + build, short summary; full log in .verify.log
pnpm lint             # Biome + dependency-direction check   (pnpm lint:fix to autofix/format)
pnpm typecheck        # tsc --noEmit everywhere
pnpm test             # Vitest everywhere
pnpm build            # tsup (packages) + next build (apps)
pnpm --filter @speeq/<pkg> test   # one package
```

## Conventions

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` without a `biome-ignore` comment
  explaining why. JSDoc on every public export. Small files (~200 lines as a guide).
- Biome for lint/format (`pnpm lint:fix`). Vitest for tests (`test/**/*.test.ts`).
- Packages resolve each other's **source** via the `@speeq/source` export condition, so tests and
  typecheck need no build. Each package: `package.json` exports map (ESM + CJS + d.ts via tsup),
  `tsconfig.json` extending `@speeq/tsconfig/library.json`, `vitest.config.ts` using
  `vitest.shared.ts`. Copy an existing package (e.g. `packages/adapters/store-memory`) as a template.
- Errors: throw `SpeeqError` with a stable code from `packages/core/src/errors.ts`. Never send raw
  error messages or stack traces to clients.
- Model IDs come from env/config, never hard-coded in app code.
- Conventional Commits with the package as scope: `feat(client): …`, `fix(server): …`, `docs: …`.
- pnpm build scripts must be allow-listed under `allowBuilds` in `pnpm-workspace.yaml`.
- TypeScript is pinned to 6.0.x on purpose. Do not upgrade.

## Commit rules

- **No AI attribution of any kind** in commits or PRs: no `Co-Authored-By`, no "Generated with",
  no tool or model names. The author is the repo's configured git user. Do not change git config.
- Never commit secrets (`.env*` except `.env.example`, keys, tokens).

## Zero-cost rule

No paid service, no credit card, no new dependency that needs a paid key. Free tiers only.

## Principles (do not break)

1. The developer owns the agent and the data. The speeq platform never receives conversation
   content or app data.
2. Headless: packages ship zero visual components. UI only in `apps/demo`.
3. Everything behind an interface (`packages/core/src/interfaces/`).
4. Secure by default: audit 404 without `authorize`, write tools need confirmation, inputs
   validated, tool output treated as untrusted.
5. Serverless-safe: no in-process state that must survive requests, web-standard Request/Response.

## Task rules (for builder agents working from `handoff/tasks/NNN-*.md`)

1. Work only on the branch named in the brief, created from the latest `main`.
2. Touch only the files listed in the brief's scope.
3. Do not change public APIs, protocol schemas (`packages/core/src/schemas/`), or anything under
   "Decisions already made", unless the brief says so.
4. If the brief is ambiguous or something conflicts, make the smallest safe choice, record it under
   "Decisions I had to make" in the report, and continue. Stop only if the task is truly impossible.
5. Run `scripts/verify.sh` before finishing. It must pass.
6. Finish: commit on the branch (rules above), write `handoff/reports/NNN-<slug>.md` from
   `handoff/REPORT_TEMPLATE.md` (under ~60 lines, no code dumps, no full logs), and print it.
   Do not merge to `main` and do not push unless the brief says so.

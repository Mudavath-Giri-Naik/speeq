# CLAUDE.md — working on speeq

speeq is an open-source, **headless** conversational-AI framework for web apps: a voice/text agent
that navigates the host app, answers from the developer's own data through developer-defined
tools, and writes a full audit log. A separate platform app collects **anonymous** adoption
counters. Read `ARCHITECTURE.md` for the big picture and `PLAN.md` for the build plan.

## Commands

```bash
pnpm install                 # Node >= 22.12 (see .nvmrc), pnpm via corepack
pnpm dev                     # demo (http://localhost:3000) + platform (http://localhost:3001)
pnpm lint                    # Biome + dependency-direction check
pnpm lint:fix                # Biome autofix + format
pnpm typecheck               # tsc --noEmit in every workspace (turbo)
pnpm test                    # Vitest in every workspace + repo scripts tests
pnpm build                   # tsup (packages) + next build (apps)
pnpm test:e2e                # Playwright e2e in apps/demo (mock LLM, typed input)
pnpm pack-all                # build + pnpm pack every package into ./dist-packs
pnpm --filter @speeq/server test         # one package
pnpm --filter @speeq/platform seed       # fake telemetry for the dashboard (seed:clear removes it)
```

The definition of "green" is: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Non-negotiable principles

1. **The developer owns the agent and the data.** Tools run in the developer's backend with their
   DB and auth. The speeq platform never receives conversation content or app data.
2. **Headless.** Packages ship zero visual components. UI lives only in `apps/demo` as examples.
3. **Modular, strict dependency direction** (enforced by `scripts/check-deps-direction.ts`):
   - `core` → only `zod` (peer).
   - `server` → `core`. `client` → `core` _at build time only_ (zero runtime deps; it bundles the
     zod-free `@speeq/core/errors|utils|protocol-types` subpaths). `react` → `client` (+ `core` types).
   - `adapters/*` → only `core` (+ their own peer, e.g. `mongodb`).
   - `testing` → `core` (+ `server` for the request helper).
4. **Everything behind an interface:** `LLMProvider`, `ConversationStore`, `KnowledgeSource`,
   `SpeechInput`, `SpeechOutput`, `TelemetryTransport` (all in `packages/core/src/interfaces/`).
   New provider = one new folder under `packages/adapters/`.
5. **Secure by default:** audit routes are 404 without `audit.authorize`. Write tools require
   confirmation. Tool inputs are Zod-validated. Tool output is untrusted data. Raw errors never
   reach the client. Secrets are compared in constant time.
6. **Privacy-honest telemetry:** anonymous counters only, opt-out. The payload is defined in
   `packages/core/src/schemas/telemetry.ts` and documented in `docs/reference/telemetry.md`, and the
   two must match. `packages/server/test/telemetry-privacy.test.ts` scans payloads for forbidden data.
7. **Serverless-safe:** no in-process state that must survive between requests, no background
   jobs, web-standard `Request`/`Response`, one short SSE stream per turn.
8. **Zero cost:** only free tiers that need no credit card.

## Conventions

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any` without a `// biome-ignore` comment
  explaining why. JSDoc on every public export. Keep files small (~200 lines max as a guide).
- Inside the monorepo, packages resolve each other's **source** through the `@speeq/source`
  export condition (see `tooling/tsconfig/base.json` and each `vitest.config.ts`), so tests and
  typecheck need no build. Published consumers get `dist/` (ESM + CJS + d.ts via tsup).
- Errors: throw `SpeeqError` with a stable `code` from `packages/core/src/errors.ts`.
  Adapters map provider errors (e.g. HTTP 429 → `RATE_LIMITED`).
- Model IDs always come from env/config. Defaults live in the adapters' README and `.env.example`.
- Conventional Commits (`feat(server): …`, `fix(client): …`, `docs: …`). Add a changeset for
  any change to a published package. Do not add AI attribution or `Co-Authored-By` trailers to
  commits or PRs in this repo.
- Record lasting decisions as a short ADR in `docs/decisions/` (next free number).

## Where things are

| What                                          | Where                                                   |
| --------------------------------------------- | ------------------------------------------------------- |
| Protocol events and bodies (Zod)              | `packages/core/src/schemas/`                            |
| Interfaces                                    | `packages/core/src/interfaces/`                         |
| HTTP handler / routing                        | `packages/server/src/handler/`                          |
| Agent loop, tool runner, built-in tools       | `packages/server/src/agent/`                            |
| Session tokens                                | `packages/server/src/security/`                         |
| Telemetry collector                           | `packages/server/src/telemetry/`                        |
| Browser client / speech adapters              | `packages/client/src/`                                  |
| React hooks                                   | `packages/react/src/`                                   |
| Demo speeq config (the integration reference) | `apps/demo/lib/speeq/`                                  |
| Platform DB schema / ingest                   | `apps/platform/db/`, `apps/platform/app/api/v1/ingest/` |
| Protocol spec                                 | `docs/reference/protocol.md`                            |
| Integration prompt for coding agents          | `docs/integration/nextjs-integration-prompt.md`         |

## Gotchas

- TypeScript is pinned to 6.0.x on purpose (ADR-0007). Do not upgrade to 7 until tsup and Next
  support its API.
- pnpm build scripts must be allow-listed under `allowBuilds` in `pnpm-workspace.yaml`.
- The memory store and the in-process rate limiter are best-effort only. Do not rely on them on
  serverless platforms.

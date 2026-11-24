# speeq — Build Plan

This is the plan for the first build of **speeq**, an open-source, headless conversational-AI
framework for web apps. It covers the file tree, the packages, the key technical decisions and
the build stages. Decisions with lasting impact are also recorded as ADRs in `docs/decisions/`.

## 1. File tree (target)

```
speeq/
├─ apps/
│  ├─ demo/                       # Next.js exam-prep demo (fake data) wired to the SDK
│  │  ├─ app/                     # pages, /api/speeq route, /admin/conversations
│  │  ├─ components/              # example UI only (mic button, transcript, dialogs)
│  │  ├─ lib/                     # fake data repo, speeq config, mock LLM rules, demo auth
│  │  └─ e2e/                     # Playwright test (mock LLM + typed input)
│  └─ platform/                   # Next.js telemetry ingest + admin dashboard
│     ├─ app/                     # /api/v1/ingest, /api/cron/cleanup, dashboard pages, login
│     ├─ components/ui/           # shadcn/ui-style primitives (Card, Button, Table, Badge…)
│     ├─ db/                      # Drizzle schema, client (Postgres or local PGlite), migrations
│     ├─ lib/                     # auth, ingest validation, metrics queries, external stats
│     └─ scripts/                 # seed.ts, seed-clear.ts, migrate.ts
├─ packages/
│  ├─ core/                       # @speeq/core
│  ├─ server/                     # @speeq/server (+ @speeq/server/next)
│  ├─ client/                     # @speeq/client
│  ├─ react/                      # @speeq/react
│  ├─ testing/                    # @speeq/testing
│  └─ adapters/
│     ├─ llm-openai-compatible/   # @speeq/llm-openai-compatible
│     ├─ llm-gemini/              # @speeq/llm-gemini
│     ├─ store-memory/            # @speeq/store-memory
│     └─ store-mongodb/           # @speeq/store-mongodb
├─ tooling/tsconfig/              # base.json, library.json, nextjs.json
├─ docs/{concepts,guides,integration,reference,decisions}/
├─ scripts/                       # pack-all.sh, check-deps-direction.ts
├─ .github/                       # CI, issue/PR templates, CODEOWNERS
├─ .changeset/
└─ root files (README, ARCHITECTURE, CLAUDE.md, llms.txt, CONTRIBUTING, …)
```

## 2. Packages

| Package                        | Purpose                                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `@speeq/core`                  | Zod schemas for the protocol, audit and telemetry; provider and store interfaces; `SpeeqError`; small utilities. Peer-depends only on `zod`.    |
| `@speeq/server`                | Runs in the developer's backend: web-standard handler, session tokens, agent loop, built-in tools, guardrails, audit, confirmations, telemetry. |
| `@speeq/client`                | Browser client with no runtime dependencies: state machine, SSE reader, Web Speech input/output, barge-in, TTS sentence by sentence.            |
| `@speeq/react`                 | `SpeeqProvider` plus hooks (`useSpeeq`, `useSpeeqContext`, `useSpeeqAudit`…). Ships no UI.                                                      |
| `@speeq/testing`               | `FakeLLMProvider`, `MockLLMProvider` (keyword rules), fake speech, SSE test helpers.                                                            |
| `@speeq/llm-openai-compatible` | `/chat/completions` streaming and tool calls through `fetch` (Groq, OpenRouter, Ollama, OpenAI).                                                |
| `@speeq/llm-gemini`            | Gemini `streamGenerateContent` with function calling and thought-signature round-trip.                                                          |
| `@speeq/store-memory`          | Map-based `ConversationStore` for dev and tests.                                                                                                |
| `@speeq/store-mongodb`         | `ConversationStore` on the developer's existing `Db`. `mongodb` is a peer dependency.                                                           |

## 3. Key technical decisions

1. **TypeScript 6.0.x, not 7.0.** TS 7 (the native port) does not ship the classic JS compiler API,
   and tsup's `.d.ts` build and Next.js type checking both rely on it. ADR-0007.
2. **Zod 4** is a peer dependency of core and server. `z.toJSONSchema()` turns tool inputs into
   JSON Schema, so no extra library is needed.
3. **The `@speeq/source` export condition** points at `src/` inside the monorepo, so typecheck and
   tests run with no build step. Published consumers resolve `import`/`require` to `dist/`.
4. **`@speeq/client` has zero runtime dependencies.** It bundles the few zod-free core modules it
   needs (`@speeq/core/errors`, `@speeq/core/utils`, protocol types) at build time. ADR-0008.
5. **Web-standard handler** `(Request) => Promise<Response>`, plus HTTP + SSE with one request per
   turn. This is serverless-safe and has no in-process state that must persist. ADR-0005.
6. **Stateless session tokens:** HMAC-SHA256 over `{sid, uid, exp}` using Web Crypto
   (`crypto.subtle.verify` is constant time).
7. **The store is the history.** Conversation history for the next LLM call is rebuilt from audit
   events, with a bounded window. Confirmation resumes are rebuilt the same way, which makes them
   serverless-safe. A `dedupeKey` on events makes "resolve confirmation" atomic and blocks replays.
8. **Telemetry flush** is never awaited before the turn's events are delivered. It runs through
   `waitUntil` when one is provided. Otherwise it runs in the stream tail after `turn.finished`,
   with a hard timeout of 1.5 s. Telemetry is enabled by default, but it only sends when an
   endpoint is configured (`SPEEQ_PLATFORM_URL`). ADR-0004.
9. **Platform DB:** Drizzle with postgres.js when `DATABASE_URL` is set (Supabase, Neon or any Postgres; pooled `DATABASE_URL` at runtime, `DATABASE_URL_DIRECT` for migrations).
   Without it, the platform uses embedded **PGlite**, so `pnpm dev` works with zero setup. ADR-0009.
10. **shadcn/ui-style primitives are vendored by hand** into `apps/platform/components/ui`. They
    follow the same open-code idea as the shadcn CLI, but the build stays non-interactive and
    reproducible.
11. **Biome** handles lint and format (ADR-0006). **tsup** builds ESM + CJS + d.ts. **Vitest**
    runs unit tests and **Playwright** runs one e2e test.
12. **Default model IDs**, verified on 2026-11-24 and always overridable by env:
    Groq `llama-3.3-70b-versatile` (`GROQ_MODEL`), Gemini `gemini-3.8-flash` (`GEMINI_MODEL`).
13. **Node:** development needs Node ≥ 22.12 (the tooling requires it); `.nvmrc` is 24. The published
    runtime packages declare `engines.node >= 20`.

## 4. Build stages

1. Scaffold: git, workspace, Turborepo, tsconfig, Biome, Vitest, Changesets, CI, community files, `.env.example`, PLAN.md, CLAUDE.md.
2. `core`: schemas, interfaces, errors, utilities, tests.
3. `testing` + `store-memory`.
4. `server`: handler, tokens, agent loop, built-in tools, tool runner, guardrails, audit, confirmations.
5. LLM adapters: OpenAI-compatible, then Gemini.
6. `store-mongodb`.
7. `client`.
8. `react`.
9. `apps/demo` + Playwright e2e.
10. Telemetry in server, then `apps/platform`.
11. Docs pass, ADRs, integration prompt, `llms.txt`, `pack-all.sh`.
12. Final verification from a clean install.

At the end of each stage, run `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then commit
with a Conventional Commit message.

## 5. Progress and handoff (updated 2026-11-24)

| Stage                         | Status                                                      |
| ----------------------------- | ----------------------------------------------------------- |
| 1. Scaffold                   | ✅ done                                                     |
| 2. `core`                     | ✅ done (32 tests)                                          |
| 3. `testing` + `store-memory` | ✅ done (store contract suite passes)                       |
| 4. `server`                   | ✅ done (45 tests)                                          |
| 5. LLM adapters               | ✅ done (openai-compatible 8 tests, gemini 5 tests)         |
| 6. `store-mongodb`            | ✅ done (11 tests on real mongod via mongodb-memory-server) |
| 7–12                          | ⏳ not started                                              |

### Next step (resume here)

Work now runs as Claude (briefs + review) / Codex (build). See `handoff/INDEX.md` and `handoff/PLAN-REMAINING.md`. Task 001 (client core) is briefed.

### Notes for the next session

- `packages/server/src/telemetry/index.ts` is a no-op placeholder; stage 10 implements the real collector behind the existing `TelemetrySink` interface (`telemetry/sink.ts`). The handler already calls every hook and flushes in the stream tail.
- Known simplifications to document in stage 11: redaction also changes the history the model sees later; confirmation args are re-validated from the stored (redacted) copy; the rate limiter is per instance.
- Commits: Conventional Commits authored by the repo owner, with **no AI attribution or Co-Authored-By trailers** (owner request). Remote: `origin` = https://github.com/Mudavath-Giri-Naik/speeq.git, branch `main`.
- Use the Write tool, not bash heredocs, for files that contain backticks or quotes (heredocs broke once).

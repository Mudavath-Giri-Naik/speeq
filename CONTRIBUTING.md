# Contributing to speeq

Thanks for helping! speeq is meant to be read and extended by strangers, so clear code and docs
matter as much as features.

## Setup

```bash
# Node >= 22.12 (see .nvmrc). pnpm comes from corepack.
corepack enable
pnpm install
pnpm dev          # demo on :3000 (mock LLM, no keys needed) + platform on :3001
```

## Commands

| Command          | What it does                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm lint`      | Biome lint/format check + dependency-direction check                                                |
| `pnpm lint:fix`  | Apply Biome fixes and formatting                                                                    |
| `pnpm typecheck` | `tsc --noEmit` everywhere                                                                           |
| `pnpm test`      | Vitest unit/integration tests                                                                       |
| `pnpm build`     | Build all packages (tsup) and apps (Next.js)                                                        |
| `pnpm test:e2e`  | Playwright e2e for the demo (run `pnpm --filter @speeq/demo exec playwright install chromium` once) |

A pull request must pass `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

## Dependency rules

`core` ← `server`; `core` ← `client` ← `react`; adapters depend only on `core`. `core` depends
only on `zod`; `client` has no runtime dependencies. `scripts/check-deps-direction.ts` enforces
this in CI. Please don't work around it. If you think a rule is wrong, open an issue.

## Adding an adapter

Every capability sits behind an interface in `packages/core/src/interfaces/`. To add one:

1. Copy the closest existing adapter folder in `packages/adapters/` (for example
   `llm-openai-compatible` for an LLM, `store-memory` for a store).
2. Rename the package (`@speeq/llm-<name>` / `@speeq/store-<name>`) and implement the interface.
3. Depend only on `@speeq/core` (plus a peer dependency for the vendor SDK if you really need one;
   prefer plain `fetch`).
4. Map vendor errors to `SpeeqError` codes (`RATE_LIMITED`, `PROVIDER_ERROR`, …).
5. Add tests with mocked network/storage. A store adapter should pass the shared contract suite
   from `@speeq/testing` (`runConversationStoreContract`).
6. Write the README (install, usage, config table, limits) and add a changeset.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/): `feat(server): add tool-calling loop`,
`fix(client): handle split SSE lines`, `docs: clarify audit authorize`. Use the package name as
the scope.

## Pull request checklist

- [ ] Tests cover the change
- [ ] JSDoc on new public exports
- [ ] Docs and package README updated
- [ ] Changeset added for published packages
- [ ] Nothing sends conversation content or app data to the speeq platform

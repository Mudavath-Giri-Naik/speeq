# REPORT 017 — CLI and integration engine

Status: DONE
Branch / last commit: task/017-cli-integration / see git log
Verify: see "Evidence" (full `scripts/verify.sh` run once at the end)

Built by the architect directly (builder agent unavailable). Not independently reviewed; the security
parts (`bindEndpoint`, ownership and rollback, auth guard, secret-name filter) were written and tested with
that in mind.

## What exists

- `@speeq/server`: `bindEndpoint` (fixed method and relative path, same-origin base, no redirects, size
  cap, timeout, `forwardAuth` only if the decision allows it). 41 tests.
- `@speeq/integrate` (only file writer): `buildPlan`, `applyPlan` (journal, backups, restore on failure,
  syntax check before writing), `rollback` and `previewRollback`, `renderDiff`, decision operations,
  ownership markers, Zod source renderer, provider and feature registries, `reviewState`.
- `@speeq/cli`: `init scan configure capabilities upgrade rollback`, `verify`/`doctor` stubs, `--json`,
  `--dry-run`, `--diff`, CI mode, scripted-prompt tests. `deps-rules.ts` knows both packages.
- Generated tools, routes, config and handler type-check against the real packages (test compiles them).
- `docs/reference/cli.md`.

## Decisions I had to make

- `foreign` generated file (marker removed) is kept silently, not a conflict; only `edited` (marker, wrong
  hash) is a conflict. This is what ADR-0016 says about handing ownership over.
- Exit 3 means stale or pending capabilities only. Manual steps (root layout) do not count, otherwise a
  finished init would exit 3 forever.
- `capabilities disable` refuses only unknown ids (disabling an unsupported capability is harmless).
- The extra rule from ADR-0015 point 9 is enforced in the engine: a function or endpoint with observed
  auth, or sensitivity personal, financial or admin, is not wrapped until the decision sets `auth`.
- Generated tools check `ctx.user` (and `roles` on the user object) in a small guard; routes are exempt.
- The CLI drops SQ0171 diagnostics for files carrying the generated marker, so a second `init` is an
  empty plan (otherwise the first apply adds that diagnostic to the manifest).
- Provider and feature choices only shape the first `speeq.config.ts`; the file is the developer's after
  that, so `configure` prints the snippet instead of rewriting it.
- Rollback with nothing to undo exits 1; a partial rollback (file edited since) exits 1.
- `SPEEQ_PACKAGE_VERSION` is a constant checked against `packages/speeq/package.json` by a test.
- Fixed `ZOD_VERSION` to the repo's 4.6.7 (the first draft had an invented version).

## Risks and open items

- No anchored layout splice yet: the provider is a printed snippet (by design for now).
- `store-memory` is the generated default; MongoDB is not detected or suggested yet.
- `--install` runs `npm/pnpm/bun`; yarn only prints the command (`--ignore-scripts` is not portable).
- Interactive flows are tested with a scripted prompter; the clack prompter itself is thin and was only
  smoke-tested non-interactively.
- Pages Router projects get a manual step instead of a handler.
- Task 018 adds the umbrella `bin`, `verify`, `doctor` and the real-app validation.

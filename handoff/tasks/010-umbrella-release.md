# TASK 010 — Umbrella `speeq` package, release workflow, dev update notice

Branch: task/010-umbrella-release (create it from latest main)

## 1. Read first

- `AGENTS.md`, `PLAN.md`, `handoff/INDEX.md`, `handoff/reports/009-docs-release.md`.
- Root `package.json` (`release`, `version-packages` scripts), `.changeset/config.json`, `.github/workflows/ci.yml`, `scripts/pack-all.sh`, `scripts/pack-test.sh`, `scripts/check-deps-direction.ts`.
- Every publishable package's `package.json` and `tsup.config.ts` (`packages/*`, `packages/adapters/*`): the umbrella must mirror their export-map style (`@speeq/source` condition, import/require with types).
- `packages/server/src/telemetry/*` (how the SDK already knows its own version and detects dev vs production), `docs/reference/environment.md`, `docs/decisions/0004-anonymous-telemetry.md`, `SECURITY.md`.

## 2. Goal

After this task a developer can `npm i speeq zod` and import every public entry point from one package (`speeq/client`, `speeq/server/next`, ...), maintainers can cut a release by merging a Changesets "Version Packages" PR, and a server running in development prints a one-line note when a newer speeq exists. The scoped `@speeq/*` packages remain the source of truth and stay independently installable.

## 3. Decisions already made (do NOT change or re-decide)

**Umbrella package**

- Location `packages/speeq`, npm name `speeq` (unscoped, verified free on npm, 2026-11-25), version `0.1.0`, MIT, same `repository`/`homepage`/`engines`/`publishConfig` shape as the other packages (`directory: packages/speeq`).
- It contains **no logic**. Each subpath file is a pure re-export: `export * from "@speeq/<pkg>"`. Do not copy source.
- Subpaths (each with `@speeq/source`, import and require conditions, and types, in the same style as `@speeq/server`):

  | Subpath                       | Re-exports                                                         |
  | ----------------------------- | ------------------------------------------------------------------ |
  | `speeq` (root)                | `@speeq/core` only (types, schemas, protocol; environment-neutral) |
  | `speeq/core`                  | `@speeq/core`                                                      |
  | `speeq/client`                | `@speeq/client`                                                    |
  | `speeq/react`                 | `@speeq/react`                                                     |
  | `speeq/server`                | `@speeq/server`                                                    |
  | `speeq/server/next`           | `@speeq/server/next`                                               |
  | `speeq/testing`               | `@speeq/testing`                                                   |
  | `speeq/llm-openai-compatible` | `@speeq/llm-openai-compatible`                                     |
  | `speeq/llm-gemini`            | `@speeq/llm-gemini`                                                |
  | `speeq/store-memory`          | `@speeq/store-memory`                                              |
  | `speeq/store-mongodb`         | `@speeq/store-mongodb`                                             |

- `dependencies`: all nine `@speeq/*` packages as `workspace:*` (pnpm rewrites to exact versions on publish).
- `peerDependencies`: `zod ^4.0.0` (required), `react >=18` (optional), `mongodb` with the **same range `@speeq/store-mongodb` declares** (optional). Mark the optional ones in `peerDependenciesMeta`. Installing `speeq` must never force MongoDB or React onto a user who does not import those subpaths.
- Importing `speeq/store-mongodb` without `mongodb` installed must fail with the normal module-not-found error from `mongodb` (do not wrap or hide it). Document this.
- One build per subpath via tsup (ESM + CJS + d.ts), `sideEffects: false`. Tree-shaking means a client-only import must not pull server code: add a test that proves `speeq/client` and `speeq/react` dist files import only `@speeq/client`/`@speeq/react`/`@speeq/core`/`react` and never `@speeq/server`.
- Dependency-direction script: allow the umbrella to depend on every package; nothing may depend on the umbrella. Update `scripts/check-deps-direction.ts` accordingly and keep its own tests passing.

**Changesets**

- `fixed` group: all nine `@speeq/*` packages **and** `speeq`, so they always share one version number. Keep `ignore` for demo/platform. Keep `access: public`.
- Keep the existing `release` script publishing with `--tag next` (pre-1.0). Do not add `latest` promotion automation.

**Release workflow `.github/workflows/release.yml`**

- Trigger: `push` to `main` only. `concurrency` group `release`, no cancel-in-progress.
- Uses `changesets/action@v1` (pin to a full version tag): when unreleased changesets exist it opens/updates the "Version Packages" PR (`version: pnpm version-packages`); when that PR is merged it runs `publish: pnpm release`.
- Job steps: checkout, pnpm setup, Node from `.nvmrc`, `pnpm install --frozen-lockfile`, then `pnpm verify`-equivalent gate (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) **before** the changesets step, and `bash scripts/pack-all.sh && bash scripts/pack-test.sh` as a pre-publish gate. Any failure blocks publishing.
- Permissions: `contents: write`, `pull-requests: write`, `id-token: write` (npm provenance). Env: `GITHUB_TOKEN`, `NPM_TOKEN` (secret), `NPM_CONFIG_PROVENANCE: "true"`, `SPEEQ_TELEMETRY: "0"`, `TURBO_TELEMETRY_DISABLED: "1"`.
- The secret is only referenced as `${{ secrets.NPM_TOKEN }}`. Never write a token value anywhere.
- The workflow must **not** be able to run on pull requests or forks.
- Add `docs/maintainers/releasing.md`: how a release works end to end, one-time setup (create npm automation token, add `NPM_TOKEN` repo secret, the 2FA requirement on the `speeq` org, first publish note: scoped packages need `access: public`), how to promote a `next` build to `latest` manually (`npm dist-tag add <pkg>@<version> latest`), how to roll back (`npm deprecate`, never unpublish after 72h). Link it from `CONTRIBUTING.md`.

**Dev-only update notice (in `@speeq/server`)**

- Behavior: once per process, on first handler creation (`createSpeeq`), if all gates pass, fetch `https://registry.npmjs.org/-/package/speeq/dist-tags` (a GET with **no** headers beyond defaults, no query string, no body, no identifiers), 2 s timeout via `AbortSignal.timeout`, and if the `next` or `latest` tag (the tag matching the running version's channel: prerelease/`0.x` uses `next` when it exists, otherwise `latest`) is a **newer** semver than the running version, print exactly one line with `console.info`:
  `[speeq] Update available: 0.1.0 -> 0.2.0. Run: npm i speeq@next` (use the real tag in the command).
- Gates (all must hold, otherwise do nothing and make **no** network request): `NODE_ENV` is not `production`, `process.env.CI` is unset, `SPEEQ_UPDATE_CHECK` is not `"0"`, `SPEEQ_TELEMETRY` is not `"0"`, and the config option below is not `false`.
- New optional `SpeeqConfig` field `updateCheck?: boolean` (default `true`; `false` disables). Add it to `docs/reference/server-config.md` and to the config schema.
- Never throws, never blocks `createSpeeq` (fire and forget, `.catch(() => {})`), never retries, never caches to disk, never runs in the edge/browser bundle (guard on `typeof process`). Failures are silent.
- Semver comparison: implement a tiny local comparator (numeric `major.minor.patch`, prerelease ordered below release, ignore build metadata). No new dependency.
- The running version must come from the same constant the telemetry collector already uses. Do not add a second source of truth.
- This is a network call from a user's server, so it is a privacy surface: document it in `docs/concepts/privacy.md` (what is requested, when, how to turn it off), `docs/reference/environment.md` (`SPEEQ_UPDATE_CHECK`), and add an ADR `docs/decisions/0010-dev-update-notice.md` (Status Accepted: dev-only, opt-out, anonymous GET to the public registry, no data sent).

## 4. Scope

Create: `packages/speeq/**` (package.json, tsup.config.ts, tsconfig.json, README.md, `src/*.ts`, tests), `.github/workflows/release.yml`, `docs/maintainers/releasing.md`, `docs/decisions/0010-dev-update-notice.md`, `packages/server/src/update-check.ts` (+ test), `handoff/reports/010-umbrella-release.md`.
Modify: `.changeset/config.json`, `scripts/check-deps-direction.ts` (+ its test), `scripts/pack-all.sh` and `scripts/pack-test.sh` (include and type-check every `speeq/*` subpath), `packages/server/src/config.ts` and the createSpeeq wiring (only for `updateCheck` and the single call), `README.md` (install section: `npm i speeq zod`, with the scoped packages as the alternative), `llms.txt`, `CONTRIBUTING.md`, `docs/reference/environment.md`, `docs/reference/server-config.md`, `docs/concepts/privacy.md`, `docs/guides/nextjs.md` (install line + imports: keep the scoped form working and mention `speeq/*` equivalents; do not rewrite the guide), `pnpm-lock.yaml`.
Do NOT touch: `apps/**`, other packages' `src/`, `handoff/INDEX.md`, `.env.example` (local file with credentials, never stage or copy it), `docs/integration/**`, `CLAUDE.md`, `AGENTS.md`.

## 5. Requirements (numbered, each testable)

1. `pnpm --filter speeq build` produces ESM, CJS and d.ts for every subpath; `exports` map matches the table above and resolves under both `import` and `require`.
2. `pack-all.sh` now packs **ten** tarballs; `pack-test.sh` installs all ten into the throwaway Next.js project (with `zod` and `react` only, **no** `mongodb`) and type-checks an import of every `speeq/*` subpath except `speeq/store-mongodb`; `speeq/store-mongodb` is type-checked in a second pass after `npm i mongodb` there.
3. A mock-mode turn through `createSpeeq` imported from `speeq/server` and `speeq/testing` completes in the scratch project.
4. Changesets `fixed` group verified: `pnpm changeset status` does not error; add one changeset (`minor`, all ten packages, "Add the speeq umbrella package and dev update notice") so the first release version bump is exercised.
5. `release.yml` passes `actionlint` if available locally (otherwise validate YAML parses and list that actionlint was skipped). No step can run for pull requests.
6. Update-notice behavior implemented per section 3 and fully unit-tested with an injected `fetch` and injected env/clock (no real network in tests).
7. All docs listed under Modify/Create are accurate against the code. Run `pnpm lint:fix` so Markdown passes Biome.

## 6. Contracts

```ts
// packages/server/src/update-check.ts
export interface UpdateCheckOptions {
  currentVersion: string;
  env: Record<string, string | undefined>; // pass process.env
  enabled: boolean; // from SpeeqConfig.updateCheck ?? true
  fetchImpl?: typeof fetch; // default globalThis.fetch
  log?: (line: string) => void; // default console.info
}
/** Resolves after the attempt; never rejects; makes no request if any gate fails. */
export function checkForUpdate(options: UpdateCheckOptions): Promise<void>;
/** Exposed for tests. Returns -1 | 0 | 1. Prerelease < release of the same x.y.z. */
export function compareVersions(a: string, b: string): -1 | 0 | 1;
```

```jsonc
// .changeset/config.json (relevant part)
"fixed": [[
  "@speeq/core", "@speeq/client", "@speeq/react", "@speeq/server", "@speeq/testing",
  "@speeq/llm-openai-compatible", "@speeq/llm-gemini", "@speeq/store-memory", "@speeq/store-mongodb",
  "speeq"
]]
```

The module-level "once per process" guard lives in the createSpeeq wiring (a module-scoped boolean), not inside `checkForUpdate`, so the function stays testable.

## 7. Tests required

- `compareVersions`: `0.1.0 < 0.2.0`, `1.0.0-next.1 < 1.0.0`, `1.0.0 = 1.0.0+build.5`, `0.10.0 > 0.9.0` (numeric not lexical), garbage input returns 0 and never throws.
- `checkForUpdate`: (a) newer `next` tag logs exactly one line with the expected text; (b) same or older version logs nothing; (c) each gate (`NODE_ENV=production`, `CI`, `SPEEQ_UPDATE_CHECK=0`, `SPEEQ_TELEMETRY=0`, `enabled=false`) results in **zero** fetch calls; (d) fetch rejects, times out, returns non-200, returns invalid JSON, or returns a non-string tag: resolves, logs nothing; (e) the request URL is exactly the dist-tags URL, no query string, and `init` carries no custom headers and no body; (f) a throwing `log` does not reject.
- createSpeeq wiring: two `createSpeeq` calls in one process trigger at most one check; `createSpeeq` returns synchronously and is not delayed by a never-resolving fetch; with `updateCheck: false` no fetch happens.
- Umbrella: for every subpath, importing the built ESM and CJS entry exposes the same export names as the underlying `@speeq/*` entry (compare `Object.keys`); `speeq` root exposes only core names; `speeq/client` and `speeq/react` dist contain no reference to `@speeq/server`; `package.json` has `mongodb` and `react` as optional peers.
- Forbidden-fields telemetry test still passes unchanged (do not weaken it).
- `check-deps-direction`: a fixture where a scoped package imports `speeq` fails; the umbrella importing all scoped packages passes.

## 8. Acceptance

- `bash scripts/verify.sh` passes with no overrides.
- `bash scripts/pack-all.sh && bash scripts/pack-test.sh` pass (ten tarballs; report sizes).
- `pnpm publish --dry-run --no-git-checks` exits 0 in `packages/speeq`; tarball contains only `dist`, `README.md`, `package.json`, license.
- `pnpm changeset status` works and shows the new changeset.
- `git diff --stat` shows only files in section 4. `.env.example` not staged. No tokens or copied env values anywhere.
- `git log --format=%B main..HEAD | grep -iE "claude|co-authored-by|generated with"` prints nothing.

## 9. Finish

Commit on the branch (Conventional Commits: `feat(speeq):`, `feat(server):`, `ci:`, `docs:`, `chore:`; no attribution lines, no Co-Authored-By). Write `handoff/reports/010-umbrella-release.md` using `handoff/REPORT_TEMPLATE.md` and print it at the end. Do not merge to main. Do not push. Do not edit `handoff/INDEX.md`. If a problem needs a change outside section 4, do not fix it silently: report it with file, line, repro and a suggested fix.

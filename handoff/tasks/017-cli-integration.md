# TASK 017 — CLI and integration engine

Branch: task/017-cli-integration (from main). Built by the architect (builder agent unavailable).

## 1. Read first
`AGENTS.md`, `docs/decisions/0013..0016`, `docs/maintainers/master-plan.md` §5,
`packages/core/src/schemas/{manifest,status}.ts`, `packages/compiler/src/{scan,reconcile}.ts`,
`packages/server/src/define.ts`, `apps/demo/app/api/speeq/[[...speeq]]/route.ts`.

## 2. Goal
`npx speeq init` scans a Next.js app, lets the developer approve capabilities, and writes owned
wrapper files, a config and a handler route, safely and idempotently, with rollback. Two new private
packages `@speeq/integrate` (engine, the only writer of host files) and `@speeq/cli` (thin shell), plus
`bindEndpoint` in `@speeq/server`.

## 3. Decisions (do not re-decide)
- Engine is pure over a `ProjectFs` (node impl + in-memory impl for tests). Plan first, apply second.
- **Ownership** (ADR-0016): owned files start with `// speeq:generated sha256=<hash of the rest>`.
  States: `missing | owned | edited | foreign`. Overwrite only `owned` (and `missing`). `edited` and
  `foreign` are conflicts: never written; plan marks them `conflict`; apply refuses (CLI exit 1).
  Removing the marker hands ownership to the developer (state `foreign`, left alone).
- Files: `.speeq/manifest.json` (scanner), `.speeq/decisions.json` (developer; only changed by an
  explicit decision operation), `.speeq/generated/tools.ts`, `.speeq/generated/routes.ts` (owned),
  `<app>/api/speeq/[[...speeq]]/route.ts` (owned, under `src/app` if the app uses `src/`),
  `speeq.config.ts` (**create-only**: written once, never overwritten, no marker; if one exists and does
  not import `.speeq/generated`, print a manual snippet).
- Routes: approved route capabilities become `defineRoute` (path `[x]` becomes `:x`; catch-all kinds are
  skipped with a note). Functions become `defineTool` calling the host export with the single object
  parameter (relative import from `.speeq/generated`). Endpoints become `defineTool` using `bindEndpoint`.
  Forms and filter-sets are reported, never wrapped (binding stays `none`).
- A capability is wrapped iff `reconcile` status is executable assuming binding (approved, current
  fingerprint, not blocked, not unsupported, access known). A stale, blocked or disabled capability is
  removed from the generated files on the next apply; this is how "stale stops execution".
- Input schemas are rendered to Zod source from the manifest `JsonSchemaLite` (subset in §6). Anything
  not renderable makes the capability `skipped` with a reason, never guessed. Secret-named fields never
  appear (the renderer re-checks and skips).
- `write` access means `risk: "write"`; confirmation stays on unless the decision has `confirm: false`.
  Tool name = decision `name` or sanitized id `[a-z0-9_]`, unique, at most 64. Title and description from
  the decision, else the manifest.
- Host files (root layout provider) are never edited in this task: the plan emits a `manual` step with
  the exact snippet. Anchored splices are a later task; ADR-0016 §2 is honoured by not editing.
- Dependencies: plan lists `speeq@<exact>` and `zod` when missing; installed only with `--install`
  (the CLI asks in interactive mode) with the detected package manager and `--ignore-scripts`.
- Apply order: compute all contents, verify TypeScript parses (syntax diagnostics), back up to
  `.speeq/backups/<ts>/` with `journal.json`, then write. A failure mid-way restores from the backup.
- Rollback restores only journal files, only if the current hash equals the recorded post-apply hash;
  deletes files the journal says were created; reports `skipped` (with reason) otherwise. No git.
- Decisions are keyed by id; approval stores the fingerprint at approval time. Rescan never edits them.
- Exit codes: 0 ok, 1 failure or conflict, 2 usage, 3 needs review (pending, stale, unreviewed or manual
  steps in CI), 4 unsupported project. `--json` prints one JSON document on stdout and nothing else;
  human text goes to stderr. Non-interactive when `--yes`, `--ci`, `CI` is set, or stdin/stdout is not a TTY.
- Provider registry: `mock` (no key; `createMockLLMProvider` from `speeq/testing`), `openai-compatible`
  (env `SPEEQ_LLM_BASE_URL`, `SPEEQ_LLM_API_KEY`, `SPEEQ_LLM_MODEL`), `gemini` (`GEMINI_API_KEY`,
  `SPEEQ_LLM_MODEL`). Feature registry: `voice`, `audit`, `confirmation`, `telemetry`. Registries are data
  (id, label, packages, env, note) and drive both config rendering and the prompts. Default `mock`.
  Model ids come only from env. Store is `store-memory` (MongoDB is only suggested when detected).

## 4. Scope
Create `packages/integrate/**`, `packages/cli/**`, `packages/server/src/endpoint.ts` (+ test),
`docs/reference/cli.md`, `handoff/reports/017-cli-integration.md`.
Modify `scripts/deps-rules.ts`, `packages/server/src/index.ts`, `pnpm-lock.yaml`, `handoff/INDEX.md`.
Do NOT touch the compiler, core schemas, protocol, or the umbrella package (task 018 adds the bin).

## 5. Requirements
1. `bindEndpoint` per §6; every restriction has a test.
2. `buildPlan` is pure and deterministic; the plan after an apply has no changes.
3. `applyPlan` and `rollback` per §3; `--dry-run` writes nothing (asserted with an fs spy).
4. CLI commands `init scan configure capabilities(list|enable|disable|show) verify doctor rollback upgrade`;
   bare `speeq` means `configure`. `verify` and `doctor` are stubs that print "available in the next
   release" and exit 0.
5. `capabilities enable <id>` records an approval with the current manifest fingerprint; `disable`
   records `disabled`. Both refuse unknown ids (exit 2), `unsupported` and credentials-blocked (exit 4).
6. `upgrade` rescans, reconciles, prints stale/new/moved/orphaned, regenerates owned files, never approves.

## 6. Contracts
```ts
// @speeq/server
export interface EndpointBindingOptions {
  baseUrl: string;            // origin only, from config. https, or http for localhost/127.0.0.1/[::1]. No credentials.
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;               // "/api/x/:id": starts with "/", no "//", "..", backslash, "?", "#", scheme, control chars
  query?: readonly string[];  // allowed query keys; other input keys go to the JSON body (non-GET) or are rejected (GET)
  forwardAuth?: boolean;      // default false. When true forwards only `cookie` and `authorization` of ctx.request
  timeoutMs?: number;         // default 8000, max 30000
  maxResponseBytes?: number;  // default 262144, max 2097152
  fetch?: typeof fetch;
}
export function bindEndpoint(o: EndpointBindingOptions): (input: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
// Errors: INVALID_INPUT (bad parameter), TOOL_ERROR (non-2xx, redirect, oversize, bad body), TOOL_TIMEOUT.
// Messages never include response bodies, URLs with query strings, or headers.

// @speeq/integrate
export interface ProjectFs { read(p: string): Promise<string | undefined>; write(p: string, c: string): Promise<void>; remove(p: string): Promise<void>; }
export type Ownership = "missing" | "owned" | "edited" | "foreign";
export interface PlannedChange { path: string; action: "create" | "update" | "delete" | "keep"; ownership: Ownership; content?: string; before?: string; reason?: string; conflict?: boolean }
export interface IntegrationPlan { changes: PlannedChange[]; wrapped: { id: string; tool: string }[]; skipped: { id: string; reason: string }[]; stale: string[]; pending: string[]; manual: { title: string; snippet: string }[]; dependencies: { name: string; version: string }[]; env: { name: string; note: string }[]; conflicts: string[] }
```
Renderable schema subset: string (minLength, maxLength, pattern, enum, format email/uri/uuid), number, integer
(minimum, maximum, exclusive*), boolean, null, array (items, minItems, maxItems), object (properties, required,
`additionalProperties: false` becomes `.strict()`), `anyOf`, `default`.

## 7. Tests
bindEndpoint: absolute, `//`, `..`, scheme and encoded-slash paths rejected; non-loopback http baseUrl rejected;
param `..` and `/` rejected or encoded; origin never changes; redirect refused; oversize aborted; timeout;
forwardAuth false sends no cookie, true sends only cookie and authorization; errors carry no body or URL.
Engine: idempotent second plan empty; hand-edited generated file detected and never overwritten; foreign file
kept; dry-run writes nothing; decisions survive rescan; changed fingerprint removes the wrapper and reports
stale; blocked and disabled not wrapped; unrenderable schema skipped; rollback restores only owned files and
skips edited ones; apply failure restores; generated sources parse; config create-only; layout is manual.
CLI: exit codes 0/1/2/3/4; `--json` one parseable document with fixed keys; `--dry-run` no writes; unknown
command is usage (2); non-TTY is non-interactive; `capabilities enable` stores the current fingerprint.

## 8. Acceptance
`scripts/verify.sh` passes; `check-deps` knows both packages; a temp copy of a fixture app integrates, a
second `init` is a no-op, and `rollback` restores the pre-init tree.

## 9. Finish
Commit on the branch (Conventional Commits, no attribution), write the report, fast-forward merge, push.

# speeq master plan: application intelligence infrastructure

Status: accepted 2026-11-27. Owner: architect. This is the durable plan for turning speeq from a
conversational-AI SDK into terminal-first infrastructure that makes an **existing** web app
intelligently interactive. `PLAN.md` remains the record of the first build. Decisions with
long-term consequences are ADRs 0013 to 0016. Briefs live in `handoff/tasks/`.

One sentence: **developers build their app once; speeq makes its approved capabilities
intelligently accessible.**

## 1. Product principles (binding)

1. Reuse existing business logic. Never duplicate it. No mandatory DB access, RAG, or hosted account.
2. The host's authorization stays authoritative. A capability runs only when the developer approved
   it, the user is authorized, input validates, policy allows it and any confirmation is done.
3. Deterministic first. Scanning, schema extraction, permissions, generation and verification use no
   LLM. An LLM may only suggest text, and a human reviews it. It never decides permissions.
4. Headless and provider independent. Zero-cost starter (mock mode needs no key).
5. Honest reporting. A correct "unsupported" beats a guessed capability. Progress lines are printed
   only for work actually done. "Verified" means a check ran and passed.
6. Progressive adoption: compiler only, runtime only, voice only, and so on.

## 2. Audit: what exists, what is missing (2026-11-27)

**Reusable as is**

| Area                  | What exists                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime contracts     | `defineTool` (Zod input, `risk`, confirmation, timeout), `defineRoute` (`:param` paths, Zod params), `resolveNavigation`                           |
| Security              | HMAC session tokens, `resolveUser`, audit with `authorize` (404 without it), write confirmation with replay guard, redaction                       |
| Providers             | LLM: openai-compatible, gemini. Stores: memory, MongoDB. Speech: `@speeq/speech` (012/013 accepted, 014 briefed, not merged)                       |
| Test utilities        | `@speeq/testing`: `FakeLLMProvider`, `MockLLMProvider`, SSE helpers. Mock mode needs no key                                                        |
| Reference integration | `apps/demo` is a hand-written integration (routes, tools, config, `app/api/speeq/[[...speeq]]/route.ts`). **It is the target of generated output** |
| Release machinery     | Changesets, `scripts/pack-all.sh`, `pack-test.sh`, `verify.sh`, `check-deps-direction.ts` rule table, umbrella `speeq@0.3.0`                       |

**Missing for the vision (all dev-time)**

- No compiler, manifest, capability status model, CLI, integration engine, doctor or verifier.
- The umbrella `speeq` package has **no `bin`**, so `npx speeq init` cannot work today.
- No fixture corpus or ground truth for Next.js apps, no accuracy benchmark.
- No provider or feature registry the CLI could read.
- `typescript` is only a dev dependency. Nothing in the repo performs source analysis or source edits.

**Constraints that shape the design**

- TypeScript is pinned to 6.0.x. Browser packages stay dependency-free (`client`, `react`).
- `core` depends only on `zod`. Dev-time code must never be imported by runtime packages.
- Published runtime packages declare `engines.node >= 20`. Dev tooling may require Node >= 22.12.
- No AI attribution in commits. No paid dependency.

**Risks I am carrying** (details in the ADRs)

- Install size of the umbrella if it depends on `@speeq/cli` (and thus `typescript`). To be measured in 022.
- ts-morph compatibility with TS 6.0.x is unverified. 015 produces the evidence (ADR-0013).
- Executing host code for runtime verification is a separate, explicitly approved operation.

## 3. Architecture: three planes, one set of contracts

| Plane                    | Runs                | Delivered in                                                 |
| ------------------------ | ------------------- | ------------------------------------------------------------ |
| Development intelligence | dev and build time  | Phase 1: compiler, manifest, CLI, integration engine, doctor |
| Application interaction  | inside the host app | existing runtime (Phase 1 reuses it), Phase 2 extends it     |
| Business intelligence    | host-owned storage  | Phase 3                                                      |

The planes share only versioned contracts: the capability manifest (`@speeq/core/manifest`), the
existing protocol schemas, and later an event schema. No plane imports another's implementation.

### Packages and dependency direction (ADR-0014)

```
core  <-  server | client <- react | adapters        (runtime, unchanged)
core  <-  compiler  <-  integrate  <-  cli  <-  speeq (umbrella bin shim)     (dev-time)
```

| Package                | Role                                                                                            | May write files        |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| `@speeq/core/manifest` | Manifest, decisions and status contracts, `resolveStatus`. Subpath only, not in the main barrel | no                     |
| `@speeq/compiler`      | Read-only discovery: repo detection, inventory, Next.js adapter, schema extraction, scoring     | **no**                 |
| `@speeq/integrate`     | Plan, preview, apply, rollback, upgrade, verify, doctor. Reusable by the Phase 4 MCP server     | yes (owned files only) |
| `@speeq/cli`           | Terminal UI, commands, control center, provider and feature registries                          | via integrate          |

Rules added to `scripts/deps-rules.ts`: runtime packages (`core`, `server`, `client`, `react`,
adapters, `testing`, `speech`) may not depend on or import `compiler`, `integrate` or `cli`.
Compiler externals: `typescript`, `ignore`. CLI externals: `@clack/prompts`, `picocolors`.
The checks are extended, never relaxed.

### Compiler pipeline (ten stages, each independently testable)

1 repo identification, 2 file inventory (jailed fs), 3 framework analysis, 4 syntax and import
analysis, 5 capability extraction, 6 support assessment, 7 developer review (CLI), 8 manifest and
decisions, 9 integration generation, 10 verification. Stages 1 to 6 live in `compiler` and are pure
functions of the repo contents. Stages 8 to 10 live in `integrate`. Stage 7 is `cli`.

### Files in a host app (ADR-0016)

```
speeq.config.ts            human-edited, server-only: providers, features, resolveUser, store   (commit)
.speeq/manifest.json       generated by scan: discovered capabilities and evidence only         (commit)
.speeq/decisions.json      developer decisions keyed by capability id, CLI- or hand-edited       (commit)
.speeq/generated/*.ts      readable wrappers: routes, tools, provider; marked as owned           (commit)
.speeq/state.json, .speeq/backups/   scan cache and rollback journal                            (git-ignore)
app/api/speeq/[[...speeq]]/route.ts   handler registration (same shape as apps/demo)             (commit)
```

Serializable data (manifest, decisions) is separate from executable code (config, wrappers).
Generated code imports the host's own functions. Nothing is copied.

## 4. Capability model (ADR-0015)

Status is **six independent dimensions**, not one enum and never a confidence percentage:

`support` (proven | needs-review | unsupported), `review` (pending | approved | disabled), `blocked`
(policy-derived), `binding` (none | bound), `verification` (unverified | verified | failed),
`freshness` (current | stale). A capability is **executable** only if approved, bound, fresh, not
blocked, not unsupported, with a developer-set access level when the compiler could not prove it.
Approval records the capability **fingerprint**. If the discovered fingerprint changes, the
capability turns `stale` and stops running until re-approved. `resolveStatus` in `@speeq/core/manifest`
is the single source of truth and has an exhaustive test.

## 5. Phase 1 delivery: tasks 015 to 022

Task numbers continue the existing handoff index. 014 (voice) is independent of all of these.
The work was merged on 2026-11-27 into **four** briefs, to cut handoff overhead. Big briefs are split into
milestones with a commit each, so a partial result is still reviewable.

| #   | Brief                                 | Outcome                                                                                                                                                                                                                                                               |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 015 | Contracts and foundation              | `@speeq/core/manifest`, `@speeq/compiler` skeleton (jailed `RepoFs`, ids, fingerprints, adapter and diagnostics contracts), ground-truth format and scorer, compiler research evidence                                                                                |
| 016 | **The whole compiler**                | Repo, workspace, tsconfig, integrations, App and Pages routes, auth evidence, Zod schemas, endpoints, server actions, forms, filters, manifest build, `reconcile`, incremental scan, 18 fixtures, benchmark                                                           |
| 017 | **CLI and integration engine**        | `speeq init/scan/configure/capabilities/rollback/upgrade`, scan report, control center, provider and feature registries, `@speeq/integrate` (plan, diff, apply, idempotency, rollback), generated wrappers, endpoint binding in `@speeq/server`, `--json` and CI mode |
| 018 | **Verification, validation, release** | Doctor and `verify` (static, mock runtime smoke, permission and confirmation tests, host commands), readiness levels, three real external apps, accuracy and timing report, umbrella `bin`, packed-tarball test, docs, changeset                                      |

Phase 1 gate (all required): ground-truth fixtures 100% on supported contracts; at least three real
external Next.js apps integrated in isolated copies with verification run; `npx speeq init` works from
a packed tarball in a clean app; repeated init is a no-op; rollback restores owned files; security
matrix passes; current SDK tests still pass; measured numbers, not estimates, in the report.

## 6. Security model (compiler and integration)

Treat the repository as untrusted data.

| Threat                               | Control                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Path traversal, symlink escape       | `RepoFs` resolves real paths inside the root. Symlinks are never followed. Tested                                             |
| Secret exposure                      | Deny list (`.env*`, keys, `.npmrc`, credential files) is never read. Manifest stores no source text, no values                |
| Arbitrary code execution during scan | Parse only. Never `import`, `require`, `eval` or run scripts from the repo                                                    |
| Resource exhaustion                  | Per-file byte cap, file-count cap, scan deadline, import-depth cap                                                            |
| Prompt injection in comments         | Comments are never fed to a model by default. JSDoc text is stored as data, length-capped, control-stripped                   |
| Unsafe generated code                | Identifiers and string literals are emitted only through escaping helpers. Generated output is re-parsed and typechecked      |
| Overwriting developer files          | Only owned files (header marker plus content hash) are overwritten. Host edits are anchored AST splices, re-parsed, journaled |
| Silent privilege grant               | New capabilities default to `review: pending`. Only a developer decision plus a fingerprint grants execution                  |
| Arbitrary URL or request tools       | No generic fetch capability. Endpoint binding is fixed method and relative path (ADR-0016)                                    |
| Supply chain                         | Dependencies installed only on explicit approval, from a fixed allow-list, exact versions                                     |

## 7. Verification methodology

- **Ground truth**: each fixture has `expected.json` (inventory, unsupported patterns, executable set).
  The scorer reports precision and recall per kind, false positives and negatives, and source-evidence
  correctness. Supported contracts must score 100%. Unsupported patterns must be reported, not guessed.
- **Real apps**: pinned revisions, license reviewed, temporary copies, never modify upstream. Results
  recorded in `docs/maintainers/phase-1-report.md` (created by 022).
- **Readiness levels** are separate and never merged: installed, configured, development ready, mock
  verified, live provider verified, production ready.
- **Performance**: scan time, incremental scan time, memory, time to first mock conversation. Measured, with the machine described.

## 8. Phases 2 to 4 (not started; gated)

Phase 2 universal agent, UI bridge, forms, context, voice ecosystem, workflows. Phase 3 analytics,
event model, proactive engagement, leads, insights. Phase 4 development MCP server (reuses
`integrate`), runtime MCP, framework adapters, production scale, evals, release hardening. Each
registers into the Phase 1 CLI through the feature registry (task 019). Each gets its own brief set
only after the previous phase gate passes.

## 9. Open items needing evidence (not decisions)

1. ts-morph versus raw TypeScript API on TS 6.0.x (task 015 evidence).
2. Umbrella install size with `@speeq/cli`: measured in task 018 (33.08 MB, 24.75 MB dev-time); see `phase-1-report.md` and the ADR-0014 outcome.
3. Which three external apps (licences) for 022. The developer's own app (SwaSeekh) is one candidate, never the only tuning target.

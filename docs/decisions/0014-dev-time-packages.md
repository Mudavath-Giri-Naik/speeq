# ADR-0014 — Dev-time packages, dependency direction and the `speeq` executable

Status: Accepted

## Context

The vision adds a compiler, integration engine and CLI. They need Node, the filesystem and a large
dependency (`typescript`). The runtime packages must stay small, browser-safe and serverless-safe
(ADR-0008). The umbrella `speeq` package has no `bin`, so `npx speeq init` cannot work today.

## Decision

1. Add three dev-time packages: `@speeq/compiler` (read-only discovery), `@speeq/integrate` (plan,
   apply, rollback, verify, doctor; writes only files it owns), `@speeq/cli` (terminal UI). Split by
   security boundary (the scanner cannot write) and reuse (Phase 4 MCP reuses `integrate` without a
   terminal), not by feature.
2. Direction: `core <- compiler <- integrate <- cli`. Runtime packages must never depend on or
   import them. `scripts/deps-rules.ts` gets rows for the new packages and a rule that forbids the
   reverse edge. Rules are extended, not relaxed.
3. The manifest, decisions and status contracts live in **`@speeq/core/manifest`** (a subpath, not
   the main barrel), so server tooling can read them and browsers never bundle them.
4. Dev-time packages throw `ToolError` with stable `SQ####` codes (defined in `@speeq/compiler`).
   `SpeeqError` stays the runtime wire error and is never used for scanner output.
5. CLI libraries: `@clack/prompts` and `picocolors`. Argument parsing uses `node:util` `parseArgs`.
   No Ink, no Commander. Every command works without a TTY and supports `--json`.
6. Executable: the umbrella `speeq` package gets `bin: { speeq: "./dist/bin.js" }`, a shim that
   imports `@speeq/cli`. `@speeq/cli` is a dependency of `speeq`. Install size is measured in task
   022. If the cost is unacceptable the fallback is to keep the shim and move `@speeq/cli` to a lazily
   installed optional dependency, with the shim printing one clear instruction when it is absent.
7. Dev-time packages declare `engines.node >= 22.12` and are `private: true` until task 022 publishes
   them together with the umbrella, so half-built packages never reach npm.

## Consequences

Apps that only use the SDK pay nothing at runtime. `npx speeq init` becomes documented only after
a packed-tarball test in a clean app passes (task 022). `docs` must not advertise it earlier.

## Outcome (task 018)

The executable shipped as decided: `speeq` has `bin: speeq`, a shim that checks Node 22.12 and imports
`@speeq/cli`, which is a regular dependency. `@speeq/cli`, `@speeq/integrate` and `@speeq/compiler` are
public and versioned in lockstep with the SDK. Measured install size of `speeq` plus `zod`: 33.08 MB, of
which 24.75 MB is dev-time (TypeScript 23.22 MB). The fallback in point 6 was not needed to ship and stays
available. The packed-tarball test passed, so `npx speeq init` may now be documented.

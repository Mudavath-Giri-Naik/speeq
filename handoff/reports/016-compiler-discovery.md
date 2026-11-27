# REPORT 016 — The whole compiler

Status: DONE
Branch / last commit: task/016-compiler-discovery / see git log
Verify: lint ✅ · typecheck ✅ · tests 614 passed / 0 failed · build ✅

Built by the architect directly after the builder agent reached its usage limit (F1, M1 and the M2
fixtures were already on the branch from that agent). Not independently reviewed.

## Milestones
F1 build-named dirs, M1 project and workspace (agent), M2 routes, endpoints, auth evidence, sensitivity,
M3 TypeScript resolution and Zod to JSON Schema, M4 endpoints, functions, server actions, M5 forms and
filters, M6 manifest, fingerprints, `reconcile`, `diffManifests`, M7 incremental cache, benchmark, docs.

## Evidence
- `pnpm --filter @speeq/compiler eval`: 21 fixtures, every supported fixture 100% precision and recall,
  evidence, access, executable and forbidden checks pass (exit 0).
- 95 compiler tests: determinism (byte identical across runs and directories), cache equals cold scan on
  every fixture, exact reanalysis sets, reconcile table, security (no writes, no code execution, secrets and
  planted instructions absent from output, pathological input, deadline, `appDir` escape, source grep for
  banned APIs), every diagnostic code emitted by a fixture.
- `apps/demo` (repo root, `appDir: apps/demo`): 17 capabilities, 9 routes proven, 3 form actions flagged
  `SQ0221`, its own `/api/speeq` handler skipped (`SQ0171`). Likely misses: none known. Packages scanned
  from the app directory alone cannot see the pnpm lockfile (package manager `unknown`).
- Benchmark: `docs/maintainers/compiler-benchmark.md`. 1 603 files in 4.3 s full, 0 parses on rescan.
  About 75% of the time is the hardened filesystem layer.

## Decisions I had to make
- Fixtures for M3 to M5 were written after the detector code, from the brief's rules, not copied from
  output; a deviation from "fixtures first" that I record here.
- Core manifest schema widened (backward compatible): `JsonSchemaLite` gains `additionalProperties`,
  `exclusiveMinimum`, `exclusiveMaximum`, `minItems`, `maxItems`, `format`; function `input.source` also
  allows `"none"` (zero-parameter functions).
- `needs-selection` results now carry a diagnostic (`SQ0101`).
- Unreadable parent `tsconfig` (npm package outside the scan) no longer drops the whole config: own options
  are used and `SQ0104` is reported.
- A route file importing `speeq` or `@speeq/*` is treated as the host's speeq handler and skipped (`SQ0171`).
- Endpoint access is always `unknown`; function access only from `@speeq read|write`.
- Filesystem layer: ignore files are read once per inventory and listing no longer re-validates each
  file path chain. Behaviour and tests unchanged.

## Risks and open items
- Filesystem reads dominate scan time; a size and mtime pre-check and a cached directory check are possible.
- Auth is observed only in the defining file and middleware, not in layouts.
- Real external apps (other than `apps/demo`) are validated in task 018, not here.

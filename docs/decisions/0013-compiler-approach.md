# ADR-0013 — Compiler: TypeScript compiler API, syntactic first, no code execution

Status: Accepted (ts-morph rejection is provisional until the task 015 evidence is reviewed)

## Context

The compiler must find routes, handlers, server actions, Zod schemas, forms and filters in existing
Next.js repositories, and later make small edits to host files. It must be accurate on JS, TS, JSX
and TSX, resolve `paths` and `baseUrl` aliases, run fast, and never execute repository code. The
repo pins TypeScript to 6.0.x (ADR-0007).

## Decision

1. Use the **TypeScript compiler API** (`ts.createSourceFile`, `ts.resolveModuleName`,
   `ts.parseJsonConfigFileContent`) as the single analysis engine. It parses JS, JSX, TS and TSX.
2. **Syntactic analysis plus module resolution only.** No `Program` or type checker in Phase 1.
   Schemas are recovered by recognising Zod builder calls in the AST and following resolved imports
   (bounded depth). Anything dynamic or not recognised is reported `unsupported`, never guessed.
   TypeScript types alone never become runtime schemas.
3. Module resolution runs through a `ModuleResolutionHost` backed by the jailed `RepoFs`, so it
   cannot read outside the repository.
4. **Source edits are AST-located text splices**: find the exact node range, replace only that range,
   re-parse, reject if new syntax errors appear. Formatting and comments are untouched. No Recast, no
   whole-file reprint.
5. Rejected: **ts-morph** (wraps a specific TS version; compatibility with 6.0.x unverified and
   lagging releases are a recurring cost), **tree-sitter** (WASM or native binaries, no module
   resolution, a second grammar to maintain), **Babel** (a second parser for no gain), **Recast**
   (unneeded with range splices), **Next.js build manifests** (require running a build, which
   executes repo code; may be an optional cross-check later), **LLM scanning** (non-deterministic).
6. OpenAPI documents and JSON Schema files are parsed as data and are a later optional source.
7. `typescript` is a regular dependency of `@speeq/compiler` and `@speeq/integrate`. The analysis
   engine does not need to match the host's TypeScript version, because it only parses.

## Consequences

Accuracy is bounded by explicit supported patterns, each with a fixture. The compiler never needs
the host's `node_modules` to be installed to scan (alias resolution reads tsconfig only). Task 015
records measurements (parse speed, memory, ts-morph install test) in
`docs/maintainers/compiler-research.md`. If that evidence contradicts point 5, this ADR is amended
before task 016 starts.

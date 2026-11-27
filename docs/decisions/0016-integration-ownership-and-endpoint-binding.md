# ADR-0016 — Integration ownership, rollback and endpoint binding

Status: Accepted

## Context

The integration engine edits a developer's application. It must be safe to run twice, must never
destroy developer work, and must not become a way for a model to call arbitrary URLs.

## Decision

1. **Owned files** carry a first-line marker with a content hash: `// speeq:generated sha256=<hash>`.
   The engine overwrites a file only if the marker is present and the hash still matches. A mismatch
   means a human edited it: the engine stops for that file, shows a diff and asks (interactive) or
   fails with exit code 1 (CI).
2. **Host files** (for example a root layout) are edited only by anchored AST splices. Supported
   shapes are listed in docs. If the shape is not recognised the engine does **not** edit; it prints
   the exact snippet and marks the step `manual`. A root layout is never rewritten wholesale.
3. **Plan, then apply.** Every run builds an `IntegrationPlan` (files to create or change, dependencies,
   env variables, manual steps, conflicts). `--dry-run` and `--diff` print it. Apply is transactional
   where practical: all new content is computed and re-parsed first, then written, with a journal.
4. **Journal and rollback.** `.speeq/backups/<timestamp>/` holds the previous content of every touched
   file plus a journal of created files. `speeq rollback` restores only files recorded there and only
   if they still match the post-apply hash. It never uses git reset and never touches other files.
5. **Dependencies** are installed only after an explicit approval, with the project's package manager,
   from a fixed allow-list, at exact versions. Never run lifecycle scripts the developer did not approve.
6. **Wrappers call host code, they do not copy it.** `.speeq/generated/tools.ts` imports the host's
   exported function and wraps it with `defineTool` and the approved input schema.
7. **Endpoint binding (HTTP route handlers)** is a typed helper in `@speeq/server`, not a generic
   fetch. Each binding has a fixed method and a fixed **relative** path with typed path and query
   parameters, same-origin only (the base URL comes from config, never from the model), no redirects
   followed, a response size cap and a timeout. Only `cookie` and `authorization` from the current
   speeq request are forwarded, and only if the decision sets `forwardAuth: true`. Implemented in
   task 020 and reviewed by the architect as security-sensitive.
8. **Runtime verification that executes host code** (importing generated wrappers, running the host's
   scripts) is a separate approved operation (`--run-host`), never implied by scanning or planning.

## Consequences

Idempotency is checkable: a second run produces an empty plan. Developers can edit generated files
deliberately by removing the marker, which transfers ownership to them.

# ADR-0015 — Capability manifest, decisions and status model

Status: Accepted

## Context

The manifest is the central contract between the compiler, CLI, integration engine, doctor and, later,
the UI bridge and MCP. It must say what the application can do without storing business data, and it
must say exactly how much is known. Developer decisions must survive regeneration. A model must never
be able to grant itself authority.

## Decision

1. **Two files, two owners.** `.speeq/manifest.json` is written only by the scanner (discovered
   capabilities plus evidence). `.speeq/decisions.json` is written only by a developer (CLI or by
   hand). Decisions are keyed by capability id. The runtime and any model have no write path to either.
2. **Capability ids are stable and deterministic**: `<kind>:<key>`, kinds `route`, `endpoint`,
   `function`, `form`, `filter-set`. Examples: `route:/subjects/[slug]`, `endpoint:GET /api/products`,
   `function:src/lib/cart.ts#addToCart`. Ids are derived from framework identity, never from labels,
   so renaming a title does not change the id. A moved file changes a `function` id; sync reports it
   as a likely move (matched by fingerprint) instead of silently re-approving.
3. **Fingerprint** = sha256 of the canonical JSON of the semantic fields (kind, key, access, input
   schema, route params, execution mechanism). Not file contents, not line numbers.
4. **Status is six independent dimensions**, never a percentage: `support` (`proven`, `needs-review`,
   `unsupported`), `review` (`pending`, `approved`, `disabled`), `blocked` (derived from policy),
   `binding` (`none`, `bound`), `verification` (`unverified`, `verified`, `failed`), `freshness`
   (`current`, `stale`). `resolveStatus` in `@speeq/core/manifest` is the only implementation.
5. **Executable** iff review is `approved` and `approvedFingerprint` equals the current fingerprint,
   support is not `unsupported`, not blocked, binding is `bound`, and access is `read` or `write`
   (when the compiler reports `unknown`, the developer must set it in the decision). A changed
   fingerprint makes the capability `stale` and non-executable until re-approved.
6. **Access is never inferred from HTTP method alone.** Endpoints default to `unknown`.
   `write` capabilities require confirmation unless the decision sets `confirm: false` explicitly.
7. **Policy blocks**: sensitivity `credentials` is always blocked (no override). `admin` and `financial`
   are blocked unless the decision sets `allowSensitive: true`. Fields named like secrets, card data,
   OTP or password never enter an input schema.
8. **Evidence, not excerpts.** Evidence holds detector id, repo-relative file, line, and a short note.
   No source text, no values from `.env`, no customer data in either file.
9. **Authentication is evidence, not proof.** Detected libraries and middleware matchers are recorded
   as `observed`. Any non-public capability needs a developer-set auth requirement in its decision.
10. The format is versioned (`manifestVersion: 1`). Unknown top-level fields are rejected; future
    modules add data only under a namespaced `extensions` map.

## Consequences

Regeneration is safe: the manifest can be rebuilt at any time and approvals persist unless meaning
changed. CI can fail on `stale` or unreviewed capabilities. The cost is a strict schema and an
exhaustive status test, which is intended.

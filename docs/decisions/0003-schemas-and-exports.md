# ADR-0003 — Share Zod schemas and source conditions

Status: Accepted

## Context

The server, tests and adapters need consistent validation and TypeScript declarations.

## Decision

Use Zod 4 as a peer and derive tool JSON Schema from Zod. Resolve workspace sources with the @speeq/source export condition. Publish ESM, CommonJS and declarations from dist.

## Consequences

Consumers use built exports. Workspace checks can exercise source without linking to a previously published build.

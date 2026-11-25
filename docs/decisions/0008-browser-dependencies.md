# ADR-0008 — Bundle the dependency-free browser contract

Status: Accepted

## Context

Loading schema validation and server dependencies in a browser client costs bundle size.

## Decision

Import core protocol types at build time and bundle the small Zod-free errors and utilities in the client.

## Consequences

The browser client has no runtime dependencies. Dependency checks prevent a new runtime import from changing that guarantee.

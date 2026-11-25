# ADR-0001 — Coordinate packages in one workspace

Status: Accepted

## Context

A protocol change can affect the server, browser bindings and several adapters together.

## Decision

Keep the SDK, adapters and example apps in one pnpm workspace. Use Turborepo for dependency-ordered builds and caching.

## Consequences

Changes can ship together while consumers install individual packages. CI checks dependency direction across the graph.

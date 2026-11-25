# ADR-0007 — Pin TypeScript 6

Status: Accepted

## Context

Declaration generation and Next.js type checking depend on the classic compiler API.

## Decision

Pin TypeScript to 6.0.x throughout the workspace.

## Consequences

Compiler upgrades require testing both declaration generation and app builds.

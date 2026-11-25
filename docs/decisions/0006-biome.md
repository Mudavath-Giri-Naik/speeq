# ADR-0006 — Use Biome for formatting and lint

Status: Accepted

## Context

Contributors and CI need the same checks for workspace files.

## Decision

Run Biome through pnpm lint and lint:fix. Keep architectural import checks in a separate script.

## Consequences

One formatter controls repository style. CI also catches package direction violations outside Biome's scope.

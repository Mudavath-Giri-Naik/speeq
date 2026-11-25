# ADR-0009 — Use Postgres and embedded PGlite for platform metrics

Status: Accepted

## Context

Production needs shared durable storage while local development should start without a hosted database.

## Decision

Use a common Drizzle schema and Postgres migrations. Select postgres.js for a configured database URL and PGlite otherwise.

## Consequences

Local PGlite applies migrations at startup. Operators run migrations explicitly on production Postgres, using a direct connection when needed.

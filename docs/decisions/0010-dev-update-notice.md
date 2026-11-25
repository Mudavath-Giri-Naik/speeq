# ADR-0010 — Check for SDK updates during development

**Status** Accepted

## Context

Developers running a pre-1.0 SDK need to know which npm channel carries compatible updates.

## Decision

At first handler creation, a development Node server can make one anonymous GET to the npm registry for the public `speeq` dist-tags. The request carries no application data, installed version or identifiers. The server compares versions locally and logs an install command only for a newer version on its channel. The request has a two-second deadline.

## Consequences

npm can observe standard connection metadata, including the server's IP address. The check runs independently of the adoption dashboard. Production, CI and edge runtimes skip it. Set `SPEEQ_UPDATE_CHECK=0`, `SPEEQ_TELEMETRY=0` or `updateCheck: false` to disable it. A failed check is silent and is never retried or written to disk.

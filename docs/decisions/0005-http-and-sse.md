# ADR-0005 — Use Fetch requests, SSE and stateless session tokens

Status: Accepted

## Context

The handler must work on short-lived hosts and stream replies as they arrive.

## Decision

Mount a web-standard Request-to-Response handler. Give each turn or confirmation its own POST and SSE response. Sign sid, uid and exp using HMAC-SHA256 and verify them against the current request identity.

## Consequences

Replicas can authenticate requests with a shared secret and rebuild conversations from shared storage. Deployments must support streaming and protect the signing secret.

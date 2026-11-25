# ADR-0004 — Flush anonymous counters after turns

Status: Accepted

## Context

Operators need adoption counts without receiving conversation content or delaying the final event.

## Decision

Validate an allow-listed aggregate snapshot, use a fresh instance UUID and send only to a configured destination. Use waitUntil or the stream tail with a 1.5-second deadline.

## Consequences

Counts are best effort. A failed send or process restart can lose data. Confirmation outcomes can arrive in a later interval than their requests.

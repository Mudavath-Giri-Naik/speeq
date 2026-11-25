# ADR-0002 — Keep the SDK headless and store history through an adapter

Status: Accepted

## Context

Host apps have different UIs, authorization rules and databases. An approval may reach a different replica from the original turn.

## Decision

Expose hooks and interfaces. Let the host render controls and execute tools. Rebuild model history and pending writes from ordered audit events in its ConversationStore. Claim confirmation decisions with per-session unique dedupe keys.

## Consequences

A durable store supports stateless resumes. Redaction changes subsequent history, and a duplicate decision cannot run the same pending operation twice.

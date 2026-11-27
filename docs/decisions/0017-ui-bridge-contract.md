# ADR-0017 — UI bridge contract: server-declared, client-executed, scoped, confirmable

Status: Proposed (owner confirms in Phase 2 plan section 9)

## Context

The agent can navigate (`navigate` event) and call server tools. Phase 2 lets it act on the page: open a
panel, set a filter, fill a form draft. The page is browser code the server cannot see, and page content
and tool results can carry prompt injection. A model must never act on the page without a contract the
developer wrote, the user can see and the user can refuse.

## Decision

1. **A UI action is a named developer function, never a DOM operation.** Contracts contain no selector,
   no element reference, no script. Handlers are developer code receiving schema-validated arguments.
2. **The server registry is authoritative.** Actions are declared server-side with `defineUiAction`
   (`name`, `description`, Zod `input`, `risk: "read" | "write"`, `confirm`, `summary(input)`), either by
   hand or generated from approved manifest capabilities (ADR-0018). The model only sees declared actions.
   The client registers **handlers** by name; a handler cannot widen what the model sees. Page-declared
   model-visible actions are rejected for this phase.
3. **Validation happens on the server before emission.** The client stays dependency-free and treats
   arguments as untrusted input (documented). A handler may add its own `parse`.
4. **Protocol (additive).** New event `ui.action` `{ callId, name, args, summary, confirm }`; new endpoint
   `POST /session/:id/ui-result` `{ callId, status: "done" | "declined" | "failed" | "unavailable", result? }`.
   `result` is JSON, at most 2 KB after serialisation, and is wrapped as untrusted tool output.
5. **Pause and resume, not fire-and-forget.** After `ui.action` the stream ends (serverless-safe, like
   `confirmation.required`). The pending call is recorded in the store; the result request verifies it and
   resumes the agent loop in its response stream. The model therefore knows whether the action happened.
6. **Replay and binding.** `callId` is issued by the server, bound to the session and turn, single use.
   Unknown id or an id from another session: `NOT_FOUND` (nothing leaks, same as confirmations). A user
   that differs from the one who started the session: `FORBIDDEN`. Reuse, or a result for a turn that
   moved on: `CONFLICT`. The claim is atomic through the store `dedupeKey`, as for confirmations. These
   checks are architect-owned code.
7. **Consent.** `risk: "write"` or `confirm: true` makes the client ask the user before the handler runs.
   The client is headless: it exposes pending state with `approve()` and `decline()`; the host renders the
   dialog. Read actions run without a prompt but are still logged. A declined action ends the chain of UI
   actions for that turn.
8. **Limits.** At most 5 UI actions per turn and 30 per session (configurable downwards or upwards with
   explicit config). Unknown, unavailable (no handler mounted) and declined results are reported to the
   model as structured outcomes, never silently dropped.
9. **Negotiation.** `CreateSessionRequest.capabilities?: ["ui-actions"]`. A session without it never
   receives `ui.*` events, and the server hides UI actions from its model. `PROTOCOL_VERSION` is unchanged
   because the change is additive and gated.
10. **Audit and telemetry.** The store records `ui.action.requested` and `ui.action.resulted` events with
    name, status and duration; arguments follow the same redaction as tool arguments. Telemetry gets
    counts only, added in task 022 together with the platform schema (019 adds none); the
    forbidden-fields test is extended to reject action names and arguments.

## Alternatives rejected

- Page-declared actions sent by the client each turn: gives a compromised page (or a user editing
  requests) a way to put text into the model's tool list; also hides capabilities from the developer's review.
- Fire-and-forget: the model cannot verify outcomes and may chain on actions that never ran.
- DOM or accessibility-tree control: unbounded authority, and the page text is an injection channel.
- Reusing `navigate` for everything now: breaking protocol change (plan open question 7).

## Consequences

Every action is reviewable as code and as a manifest entry. One extra request per UI action. The server
needs a pending-call record (same store, same retention as confirmations).

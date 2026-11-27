# ADR-0020 — Workflows: a linear, developer-authored state machine with no authority of its own

Status: **Proposed**. The shape below is decided; the open questions need a prototype (task 022) before
this is Accepted.

## Context

Users ask for multi-step outcomes ("book a demo and add it to my calendar"). Running them as one model
loop is unreliable and hard to audit; letting a workflow call things the agent could not is
privilege escalation.

## Decision

1. **Authored by the developer** with `defineWorkflow({ id, description, input, steps })`. No inferred
   or model-written workflows (principle 3). The CLI may list them; the compiler does not generate them.
2. **A step is an existing contract**: a tool or capability call, a UI action, or a navigation. Every step
   goes through the same gate as a direct call (authorize, validate, risk, confirmation, audit). A workflow
   can never do something the agent could not do directly. There is no workflow-level privilege.
3. **Linear in v1.** Steps run in order; arguments come from the workflow input or earlier step results by
   explicit mapping. No loops, no branching, no parallelism, no code in steps.
4. **State machine.** States: `proposed` (model asked to start), `running`, `awaiting-confirmation`,
   `awaiting-ui`, `awaiting-input`, `completed`, `cancelled`, `failed`, `expired`. Allowed transitions are
   a table in code with an exhaustive test (like `resolveStatus`); every other transition throws.
5. **Starting needs consent.** Starting a workflow is shown to the user as one summary listing all steps,
   with a count of write steps. Each write step still asks for confirmation when it runs.
6. **Cancel and expiry.** The user can cancel at any time, which stops further steps. A workflow expires
   after a TTL (default 15 minutes) and cannot be resumed after that. A failed step stops the workflow
   (`onFailure: "stop"` is the only v1 mode); completed steps are not rolled back, and the final message
   says exactly which steps ran.
7. **Idempotency.** Each write step carries a per-run idempotency key passed to the handler in context.
   Handlers that cannot honour it must be declared non-idempotent and are not retried.
8. **State is stateless-safe**: the run record lives in the store, keyed by session and run id, never in
   process memory.
9. **Limits.** At most 10 steps per workflow, 1 running workflow per session, caps counted in audit.

## Open questions (need evidence)

- Persistence: new `ConversationStore` methods (touches `store-memory` and `store-mongodb`) versus
  encoding runs as events. Prototype both; compare adapter change size and query needs.
- Whether results from step N may feed step N+1 as raw JSON or only through the explicit mapping with
  schema checks (default: mapping with schema checks).
- Whether the demo has a real two-step case that justifies the runner before it is built (otherwise 022
  ships the runner behind the feature flag and the gate evidence uses a fixture workflow).

## Consequences

Predictable, auditable multi-step behaviour at the price of expressiveness. Branching is a later ADR.

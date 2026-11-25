# Confirmations

Classify a lookup as `risk: "read"` and a mutation as `risk: "write"`. Writes require approval by default. Supply `confirmationSummary(input)` to describe the specific change in terms the user can review.

Render `pendingConfirmation.summary` and separate approve and reject controls. Call `confirm(pendingConfirmation.confirmationId, approved)` for the chosen decision. The authenticated resume loads the pending request from the store. A unique resolution dedupe key ensures that only one response can claim it, including concurrent responses. A replay returns `CONFLICT`.

The approved tool receives revalidated arguments from the stored, potentially redacted copy. Check current permissions in the handler and make external side effects idempotent where necessary. A crash after recording approval can interrupt execution. [Store contract](../guides/stores.md)

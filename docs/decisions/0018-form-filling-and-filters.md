# ADR-0018 — Form filling is draft-only; filters are validated navigation

Status: Accepted (owner accepted 2026-11-27; implemented in task 020, see the revision note under point 8)

## Context

The compiler already discovers `form` capabilities (fields with `type`, `required`, `sensitive`,
optional `actionRef`) and `filter-set` capabilities (typed query parameters). Their `runtimeBinding` is
`"none"`: nothing uses them. Forms are where mistakes and personal data concentrate.

## Decision

1. **Fill, never submit.** The agent can propose values for a form's fields as a **draft**. Submitting is
   done by the user pressing the real button, or through the form's `actionRef` server action, which is
   an ordinary write capability with the existing confirmation flow, validation and audit. There is no
   "submit form" action.
2. **A form is fillable only if its capability is executable** (approved, fresh, bound, not blocked,
   ADR-0015). Binding means the host called `useSpeeqForm(formId, ...)`. The generated descriptor
   (`.speeq/generated/ui.ts`) is derived from the manifest field list, not typed by hand.
3. **Field filter (architect-owned).** For each proposed value: unknown field name rejected; `sensitive`
   fields rejected (the compiler already marks secret, card, OTP and password names); type checked
   strictly with no coercion beyond what the discovered type says; length capped. Rejected fields are
   reported back to the model as `FIELD_NOT_ALLOWED` with the field name, never dropped silently, and
   never written.
4. **No clobbering.** A field the user already edited (dirty) is not overwritten; it is reported as
   `FIELD_DIRTY`. The model may ask the user, who can clear it.
5. **Consent.** The draft is applied through the UI bridge (ADR-0017). Because it only changes unsent
   page state, it is `risk: "read"` for the confirmation rule, but the client shows what was filled
   (the host can render the pending state) and the result lists applied and rejected fields.
6. **Headless binding.** `useSpeeqForm(formId, { getValues, setValues, isDirty })` is the only touchpoint
   with the host form library. No DOM queries. Integrate prints the one-line binding snippet as a manual
   step; it does not splice into component files unless the shape is one of the documented anchors.
7. **Filters are navigation** (implemented: the compiler already folds a filter-set's parameters into its route's `queryParams`, so an approved route validates them; an approved filter-set is reported as applied through its route, or skipped with that reason). A `filter-set` is applied by building the route URL with validated query
   values and emitting the existing `navigate` event through `resolveNavigation`. Unknown parameters are
   rejected, enum-like values checked against the discovered parameter type. No bridge handler is needed.
8. **Manifest change (revised in task 020: none).** The original plan was to widen `runtimeBinding`; it was dropped, because `runtimeBinding` is the scanner's observation ("no binding found in source") and whether a form is bound is decided by the integration plan (a descriptor is generated) and at runtime by `useSpeeqForm`. The manifest and fingerprints are unchanged, which also avoids a `manifestVersion` bump now that 0.5.0 and 0.6.0 are published. Original text: **Manifest change.** `FormCapability.runtimeBinding` widens from `"none"` to `"none" | "ui"`.
   `manifestVersion` stays 1 because the manifest first ships in 0.5.0 (npm serves 0.2.0 today). If 0.5.0
   is published before task 020, bump to 2 and keep a reader for 1 (plan open question 6). The fingerprint
   does not include `runtimeBinding`, so approvals are unaffected.

## Alternatives rejected

- Agent-driven submit: duplicates the write-capability path with weaker guarantees.
- Filling by DOM selectors or `name` attributes: couples to markup, bypasses the sensitive-field filter.
- Dropping sensitive fields silently: the model and user would not know the draft is incomplete.

## Consequences

Filling is only as good as the compiler's field list; forms the compiler reports `unsupported` or
`needs-review` stay unfillable until approved (honest, per principle 5). Task 020 measures how many forms
in the six real apps are bindable.

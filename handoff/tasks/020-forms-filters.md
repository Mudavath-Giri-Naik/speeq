# TASK 020 — Forms and filters: draft-only form fill, generated UI descriptors, filter application

Branch: task/020-forms-filters (from main). Built by the architect (Codex unavailable).

## 1. Read first

`docs/maintainers/phase-2-plan.md` §5 (gates G4 to G6), `docs/decisions/0018-form-filling-and-filters.md`,
`0017`, `0015`; report 019; `packages/integrate/src/{plan,render,runtime,verify}.ts`;
`packages/server/src/{define,resolve}.ts`; `packages/client/src/client.ts` (`registerUiAction`).

## 2. Goal

An approved form capability becomes an agent action that fills a **draft** of the form on the page. The user
reviews it and submits it. Filters keep working through validated navigation. The integration engine
generates `.speeq/generated/ui.ts` from approvals and `verify` checks it. The demo shows it end to end.

## 3. Decisions already made

- **Fill, never submit** (ADR-0018). There is no submit action. Submitting is the user's button or the form's
  `actionRef` write capability.
- **No manifest schema change.** Revises ADR-0018 point 8: `runtimeBinding` stays `"none"` (the scanner's
  observation that no binding exists in source). Whether a form is bound is decided by the integration plan
  (a descriptor is generated) and at runtime by `useSpeeqForm`. No `manifestVersion` bump, no fingerprint change.
- **Filters need no bridge.** The compiler already merges a filter-set's parameters into its route's
  `queryParams`, and `navigate` validates route params. An approved filter-set is reported as applied through
  its approved route; without an approved route it is skipped with that reason.
- **Field filter (architect-owned, server side, `defineFormFill`)**: unknown field names, sensitive fields and
  field types that cannot be filled (`password`, `hidden`, `file`, `submit`, `button`, `image`, `reset`) are
  rejected before anything reaches the page, with a message that starts `FIELD_NOT_ALLOWED` and names the field.
  Values are strictly typed (text-like: string up to 2000 chars; number: finite; checkbox: boolean), at most 30
  fields. Prototype keys (`__proto__`, `constructor`, `prototype`) are always rejected.
- **No clobbering (client side, `createFormFillHandler`)**: a field the user edited (`isDirty`) is not written and
  is reported `FIELD_DIRTY`. `isDirty` is required in the binding, so the host must decide.
- A form action is `risk: "read"`, `confirm: false` (it only changes unsent page state); its result lists
  `applied` and `rejected`. Its summary names fields, never values.
- Action name: `formFillActionName(formId)` in `@speeq/core/utils`: `ui_fill_<slug>_<6 hex of FNV-1a>`, at most
  64 characters, shared by server, client and generator so they cannot drift.
- `ui.ts` is generated only when at least one form is executable or the file already exists. Forms need no
  `auth` decision (a draft is local), but admin/financial/credentials policy blocks apply unchanged.
- Host wiring stays manual and headless: `useSpeeqForm(formId, { setValues, isDirty })`. Integrate prints the
  snippet; it never edits component files.

## 4. Scope

Create: `packages/server/src/forms.ts`, `packages/client/src/form-fill.ts`, tests for each,
`apps/demo/components/practice-filters.tsx`, `apps/demo/e2e/forms.spec.ts`, `handoff/reports/020-forms-filters.md`.
Modify: `packages/core/src/utils/*`, `packages/server/src/index.ts`, `packages/client/src/index.ts`,
`packages/react/src/{hooks,index}.ts`, `packages/integrate/src/{plan,render,runtime,verify,registry,index}.ts`
(+ tests), demo files, docs, ADR-0018, `docs/maintainers/phase-2-plan.md` (status), CLI real-app validation.
Do NOT touch: protocol schemas, manifest schemas, compiler extraction, telemetry, store adapters.

## 5. Contracts

```ts
// @speeq/core/utils
export function formFillActionName(formId: string): string;
// @speeq/server
export interface FormFieldSpec {
  name: string;
  type: string;
  required: boolean;
  sensitive: boolean;
}
export function defineFormFill(spec: {
  id: string;
  title: string;
  fields: FormFieldSpec[];
}): UiActionDefinition & { form: { id: string; fields: FormFieldSpec[] } };
// input: { values: { <fillable field>?: string | number | boolean } }  -> ui.action args
// @speeq/client
export interface FormBinding {
  setValues(values: Record<string, string | number | boolean>): void | Promise<void>;
  isDirty(name: string): boolean;
}
export function createFormFillHandler(binding: FormBinding): UiActionHandler;
// result: { applied: string[]; rejected: { field: string; reason: "FIELD_DIRTY" | "FIELD_INVALID" }[] }
// @speeq/react
export function useSpeeqForm(formId: string, binding: FormBinding): void;
```

## 6. Tests required

- name: stable, valid for the server name rule, unique for ids differing only in punctuation.
- `defineFormFill`: accepts valid partial fills; rejects unknown, sensitive, unfillable-type, prototype-key,
  wrongly typed, oversize and more than 30 values; protected fields never appear in the model-facing schema;
  radios with the same name collapse; a form with no fillable field is refused at definition time.
- client handler: applies clean fields, reports dirty ones, never calls `setValues` with a dirty or invalid
  field, applies nothing and still returns when all fields are dirty, ignores prototype keys, caps the result.
- React: registers the form action by name, uses the latest binding, unregisters.
- integrate: `ui.ts` generated for approved executable forms only; absent when none; blocked (admin) and stale
  forms skipped; sensitive-only forms skipped; second plan is empty; filter-set reported through its route or
  skipped; S4 sees a stale `ui.ts`; runtime check fails when a generated action accepts a protected field.
- demo e2e: fill a draft (nothing navigates), user submits, a dirty field is not overwritten and the assistant
  says so.

## 7. Acceptance

`scripts/verify.sh`; `pack-all.sh` + `pack-test.sh`; Playwright; real-app table for G4/G5 in the report
(forms and filter-sets found, executable-eligible, skipped with reason, against an independent baseline);
client gzip delta.

## 8. Finish

Commit on the branch, no attribution. Report in `handoff/reports/020-forms-filters.md`.

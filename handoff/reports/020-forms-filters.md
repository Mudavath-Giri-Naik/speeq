# REPORT 020 — Forms and filters

Status: DONE (built by the architect, not Codex)

Branch / last commit: task/020-forms-filters

Verify: lint ✅ · typecheck ✅ · tests 815 passed / 0 failed · build ✅ (`scripts/verify.sh`); `pack-all.sh` + `pack-test.sh` and Playwright (4 specs, one worker) run before merge.

## What I did

- `@speeq/core/utils`: `formFillActionName`, shared by server, client and generator.
- `@speeq/server`: `defineFormFill`, the server-side field filter. Unknown, protected (compiler flag or secret-like name), unfillable-type (`password`, `hidden`, `file`, ...) and prototype-key fields are rejected with `FIELD_NOT_ALLOWED: "<name>" ...`. Types are strict, at most 30 fields, protected names never appear in the model-facing description, and a form with nothing fillable is refused.
- `@speeq/client` `createFormFillHandler` and `@speeq/react` `useSpeeqForm`: draft only, `isDirty` required, dirty fields reported `FIELD_DIRTY` and never written.
- `@speeq/integrate`: `.speeq/generated/ui.ts` (owned, hashed, rollback-safe), forms in the plan (executable only, no auth decision needed), filter-sets reported as applied through their approved route, config wiring, manual binding snippet, stale forms in the stale list, S4 covers `ui.ts`, new runtime check R8.
- CLI review offers forms separately (none preselected).
- Demo: the practice filter form is a client component bound with `useSpeeqForm`; the layout wraps page content in the provider; mock rules; Playwright `forms.spec.ts`; e2e runs with one worker (shared in-memory store).
- Docs: guide section "Fill a form", reference rows, ADR-0018 accepted with a revision note.

## Deviations from the brief

- None of substance. The manifest is unchanged (brief §3 states it), which revises ADR-0018 point 8.

## Decisions I had to make (please review)

- Forms are `risk: "read"`, `confirm: false` (draft only). The page shows what changed through the assistant's reply, not a prompt.
- Forms never need an auth decision. Admin and financial blocks still apply, and credentials can never be approved.
- `isDirty` is mandatory in `FormBinding`: a host must decide, and a throwing `isDirty` counts as dirty.

## Risks / unsure about

- Many real forms use `{...register()}` or shadcn `Form` components and have no named fields in source, so the scanner marks them needs-review and nothing can be filled (see table).
- The independent baseline for filters (pages that read `searchParams`) is crude: it counts reads, not filters.

## Real-app results (gates G4 and G5)

Six pinned apps, raw data in `docs/maintainers/real-app-results.json`.

| App                          | `<form` tags (baseline) | Forms found | With a fillable field | Approved | Fill actions generated | Filter pages (baseline) / filter-sets found |
| ---------------------------- | ----------------------- | ----------- | --------------------- | -------- | ---------------------- | ------------------------------------------- |
| saas-starter                 | 9                       | 9           | 3                     | 8        | 0                      | 0 / 0                                       |
| commerce                     | 7                       | 7           | 0                     | 7        | 0                      | 2 / 0                                       |
| taxonomy                     | 5                       | 5           | 3                     | 4        | 2                      | 4 / 0                                       |
| nextjs-subscription-payments | 9                       | 9           | 8                     | 3        | 2                      | 1 / 0                                       |
| next-saas-stripe-starter     | 2                       | 2           | 0                     | 1        | 0                      | 5 / 0                                       |
| ai-chatbot                   | 1                       | 1           | 0                     | 1        | 0                      | 0 / 0                                       |

Totals: 33 of 33 `<form` tags found (100%). 14 forms have a fillable field. 4 fill actions were generated and runtime check R8 passed where `ui.ts` existed. Every skipped form says why ("No field of this form can be filled" or "Blocked"). Filters: 0 of 12 baseline pages were recognised as filter-sets, because those apps read `searchParams` without a Zod schema, which the scanner reports instead of guessing. `init`, repeated `init` (no-op) and `rollback` (tree restored) passed on all 6.

## Size (gate G7)

Gzip of `dist/index.js` at level 9: `@speeq/client` 20 785 B before 019 and 21 760 B now (+975 B for 019 and 020). `@speeq/react` 2 196 B before and 2 367 B now (+171 B).

## Open questions

- Filter detection beyond Zod-parsed `searchParams` (evidence: the 12 pages above).
- Form field discovery for `register()` and shadcn forms.

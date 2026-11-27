# Phase 2 plan: universal agent, UI bridge, forms, page context, voice, workflows

Status: proposed 2026-11-27, awaiting owner confirmation of the decisions in section 9. Nothing in this
phase is implemented. Phase 1 (tasks 015 to 018) is complete: `docs/maintainers/phase-1-report.md`.
Binding rules: `AGENTS.md` principles and `master-plan.md` sections 1, 3, 4. ADRs 0017 to 0020 hold the
hard decisions; this file holds scope, architecture, gates and tasks.

One sentence: **the agent may act on the page only through contracts the developer declared, the user can
see, and the user can refuse.**

## 1. Audit (2026-11-27)

| Area                    | Exists                                                                                                                                                                                         | Missing for Phase 2                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol                | 9 event types (`packages/core/src/schemas/protocol.ts`), `navigate` (server proposes, client performs), `confirmation.required` + `POST /session/:id/confirm` (`schemas/http.ts:69`)            | No client-executed action event, no result channel back to the server, no capability negotiation: a client cannot say which event types it understands                                      |
| Client                  | `onNavigate`, `getContext` (`client/src/client.ts:389,432`, `context.ts`), confirm flow, speech in/out, no runtime deps                                                                        | No action registry, no pending-action state, no result reporting                                                                                                                         |
| React                   | `SpeeqProvider`, hooks, `useSpeeqContext` registry (`react/src/context-registry.ts`)                                                                                                           | No `useSpeeqAction`, no form binding                                                                                                                                                     |
| Server                  | Agent loop with confirmation pause and resume (`server/src/agent/loop.ts:99,246`), `defineTool`/`defineRoute`, `bindEndpoint`, tool output treated as untrusted                                | No `defineUiAction`, no workflow runner, no tool catalog selection. Page context is sent free-form, put in the prompt (`prompt.ts:79`, 2000 chars) and **stored raw** with the user message event (`handler/turn.ts:84`) |
| Manifest and compiler   | `form` capability (fields with `type`, `required`, `sensitive`; `actionRef`; `runtimeBinding: "none"`) and `filter-set` (typed `parameters`), discovered by `compiler/src/extract/{forms,filters}.ts`, fingerprinted, 100% on fixtures | `runtimeBinding` is the literal `"none"`: nothing consumes forms or filter-sets at runtime. Integrate renders only `tools.ts` and `routes.ts` (`integrate/src/render.ts`)                  |
| CLI and integrate       | Feature registry is data (`integrate/src/registry.ts`: `FEATURES` ids `voice`, `audit`, `confirmation`, `telemetry`), generated wrappers, ownership, rollback, verify with runtime sandbox         | No `ui-bridge` feature, no `.speeq/generated/ui.ts`, verify has no checks for UI actions                                                                                                 |
| Speech                  | `@speeq/speech` adapters (sarvam, gemini-stt, detect-then-transcribe), client endpointing, VAD, server speech I/O. 012 and 013 accepted                                                          | 014 (natural conversation) is `briefed`, not merged (`handoff/INDEX.md`). Anything "voice ecosystem" depends on it                                                                         |
| Demo                    | `apps/demo` with widget, confirm dialog, `QuestionContext`, Playwright e2e, mock LLM rules                                                                                                     | A form to fill and a filterable page that the agent can drive; e2e for the bridge                                                                                                        |
| Release                 | Changesets PR #4 (0.5.0) open; **npm still serves 0.2.0** (`npm view speeq version`); `gh` is not installed here so the PR state was not checked                                                  | Manifest and CLI are unpublished: no installed base to break, which the ADRs rely on                                                                                                     |

Two facts shape everything: (1) filters are URL query parameters in Next.js apps, so applying filters is
the existing `navigate` mechanism with validated query values, not a new bridge; (2) a form's submit
already has a safe path, the `actionRef` server action wrapped as a write capability with confirmation.

## 2. Scope and non-goals

In scope: a UI action contract (ADR-0017), form filling as drafts (ADR-0018), filter application, a
privacy model for page context (ADR-0019), a tool catalog that scales to the 20 to 30 capabilities real
apps produce (Phase 1 real apps: 18 to 31), a linear workflow runner (ADR-0020), voice registered through
the feature registry (limited to what 014 delivers), generated bridge descriptors and verification.

Non-goals (stated so they are not built by accident):

- No DOM scraping, selectors, screenshots, accessibility-tree reading or "click this element" by model.
- No agent form submission. Submit is the user's own button, or the form's `actionRef` capability.
- No LLM-inferred workflows or capabilities. Workflows are authored by the developer.
- No new transport: SSE plus the existing JSON endpoints. No WebSocket, no server-held connections.
- No non-React bindings (client core is framework-free; Vue/Svelte hooks wait for evidence of demand).
- No analytics, proactive prompts or BI (Phase 3), no MCP (Phase 4), no new speech providers.
- No platform changes: the speeq platform still receives only anonymous counters (principle 1).

## 3. Architecture

Reuse, do not replace:

- **Manifest, decisions, status** (`@speeq/core/manifest`): forms and filter-sets become executable
  through the same six-dimension status. `binding` becomes `bound` when a UI binding exists.
- **Server pipeline**: UI actions run through the same `prepare` gate as tools (validate, risk,
  confirmation, audit) and the same pause-and-resume as `confirmation.required`.
- **`@speeq/integrate`**: new owned file `.speeq/generated/ui.ts` (descriptors only, no handlers),
  ownership hash, plan, rollback and verify unchanged in shape. Host-side binding code is a printed
  snippet or an anchored splice, never a rewrite (ADR-0016 point 2).
- **Feature registry**: each capability of this phase is one `FeatureEntry` (`ui-bridge`, `page-context`,
  `workflows`; `voice` already exists). `FeatureEntry.id` is a union today; task 019 widens it. The CLI
  lists, enables, configures and verifies them through the registry only.

```
host developer code            speeq server (stateless)                browser
 defineUiAction (descriptor) -> prepare gate: schema, risk, caps  ->  ui.action event
 generated ui.ts (from forms)    emits, ends stream, stores pending      pending state (headless)
                                 POST /session/:id/ui-result <-----      user approves or declines
                                 replay guard, resume loop               handler(args) in host code
```

Package boundaries are unchanged (`core <- server | client <- react`). `client` stays dependency-free:
it gains a registry and state, no validation library. Servers validate with Zod before emitting
(ADR-0017). Generated descriptors use `speeq/server`; hooks live in `@speeq/react`.

## 4. Security model

The page and every tool result are untrusted. A prompt-injected model is assumed. Controls:

| Threat                                                         | Control                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Model acts on something the developer never exposed            | Server registry is authoritative. An action name not in it is never emitted. The client cannot add model-visible actions          |
| Model clicks or reads arbitrary DOM                            | No selector or DOM API in any contract. Handlers are developer functions with schema-validated args                              |
| Write-like UI action without consent                           | Descriptor `risk: "write"` (or `confirm: true`) requires user approval in the client before the handler runs; no default bypass |
| Replay, forged or cross-session results                        | `callId` is issued by the server, bound to session and turn, single use; unknown or foreign id `NOT_FOUND`, reuse `CONFLICT`    |
| Result data steers the model (injection via the page)          | Result is capped, JSON only, wrapped as untrusted tool output like tool results                                                |
| Action loops and floods                                        | Caps per turn and per session, declined action stops the chain for that turn                                                    |
| Form fill leaks or overwrites                                  | Sensitive and unknown fields rejected and reported, dirty fields not overwritten, drafts never submitted (ADR-0018)             |
| Page context leaks secrets or personal data                    | Declared keys only, server allow-list, sensitive-name and value screening, query redaction, raw values never stored (ADR-0019)  |
| Old client breaks on new events                                | Events are sent only to sessions that declared `ui-actions` at creation                                                          |
| Workflow becomes a privilege escalation                        | A step is an ordinary capability or action call through the same gate, so it has no authority of its own (ADR-0020)             |
| Telemetry or audit becoming a data leak                        | Telemetry allow-list and its forbidden-fields test are extended, not relaxed: no action names with args, no field values, no context |

Security-sensitive code is architect-owned (CLAUDE.md): the `ui-result` verification and replay guard,
the form-fill field filter, the context allow-list and redaction, the audit and telemetry changes.

## 5. Verification method and gates

Same method as Phase 1: ground truth, real evidence, honest levels, measured numbers.

| Gate | Check                                                                                                                                                          | Evidence                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| G1   | Protocol and descriptor contracts: exhaustive schema tests, every malformed input rejected                                                                     | `core` and `server` tests                                                                             |
| G2   | Security matrix (section 4): one named test per row, including injection through tool output and page context                                                  | tests listed in the Phase 2 report                                                                    |
| G3   | Backward compatibility: a session without `ui-actions` never receives a UI event; all existing tests pass; `pack-test.sh` and the Phase 1 tarball test pass       | `scripts/verify.sh`, both scripts                                                                      |
| G4   | Compiler to bridge: on the 21 fixtures, descriptors generated for approved forms and filter-sets match expected files exactly; unapproved or sensitive fields never appear | `compiler eval` extended, `integrate` tests                                                           |
| G5   | Real apps: for the 6 pinned apps, count forms and filter-sets found, bindable, and skipped with reason, against an independent baseline (JSX `<form>` and `searchParams` reads counted directly from files) | `validate:real` extended, table in the report                                                         |
| G6   | Browser end to end in `apps/demo` (Playwright, mock LLM): fill a draft and submit by hand, apply filters, decline a UI action, replay rejected, old client unaffected | e2e run output                                                                                        |
| G7   | Bundle and latency: `@speeq/client` gzip size before and after (baseline measured at the start of 019); UI round trip adds exactly one request; p50 and p95 over 100 mock runs reported | numbers in the report. The size budget is open question 5                                              |
| G8   | Live model evaluation (separate level, reported, not a gate): a fixed set of 30 prompts against the demo on a free-tier provider, action-selection accuracy and wrong-action count (must be 0 for write actions without confirmation) | `docs/maintainers/phase-2-report.md`, provider and date stated                                        |

Readiness levels stay separate: nothing says "live provider verified" unless G8 ran.

## 6. Task breakdown

| #   | Brief                                          | Content                                                                                                                                                                                                                     | Depends on |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 019 | UI bridge: contract, runtime, hooks, registry | `ui.action` event, `ui-result` endpoint, session `capabilities`, `defineUiAction`, loop pause and resume, client registry and pending state, `useSpeeqAction`, `ui-bridge` feature entry, audit events, demo actions, G1 to G3 for the bridge | 018        |
| 020 | Forms and filters                              | Widen `runtimeBinding`, generated `.speeq/generated/ui.ts`, form draft fill, `useSpeeqForm`, filter apply through validated navigation, integrate plan and verify checks, demo form and filter page, G4 to G6              | 019        |
| 021 | Page context and the universal agent           | Context declaration, allow-list, redaction, storage policy, tool catalog selection for large capability sets, prompt changes, voice entry in the registry (after the 014 decision), G7 baseline, open questions 2 and 3 | 019        |
| 022 | Workflows and the Phase 2 gate                 | Linear workflow state machine and runner, persistence, cancel and expiry, verify checks, full gate evidence, live evaluation, `phase-2-report.md`                                                                              | 019 to 021 |

Briefs 020 to 022 are written only after the previous one is accepted (as in Phase 1). Task 019 is the
only brief written now.

## 7. Release and sequencing notes

- Publish the 0.5.0 Changesets PR before 020 if the owner wants registry validation of `npx speeq init`
  (Phase 1 open item 2). 019 does not depend on it.
- Each task adds one `FeatureEntry`; the CLI never learns feature names outside the registry.
- Every brief ends with `scripts/verify.sh`; the packed-tarball scripts run in 019 (client/server API
  change) and 022.

## 8. Open questions (need evidence, not decided)

1. **Voice scope.** 014 is unmerged. Whether the Phase 2 voice work is only "register 014's features" or
   more depends on its result. Decide at the start of 021 after the owner chooses to merge or drop 014.
2. **Tool catalog scaling.** At what capability count does tool selection degrade on free-tier models?
   Evidence: a measured eval in 021 (30 prompts at 10, 20 and 30 tools). Until then the catalog design
   (task 021) is limited to deterministic narrowing (route and page based), no LLM re-ranking.
3. **Audit of context.** Today raw page context is stored with every user message event. Whether to keep
   keys only or a hash needs a look at how the demo audit page and dashboard consume it (021).
4. **Workflow persistence.** Reuse `ConversationStore` events or add a store method (touches both
   adapters). A prototype in 022 decides; ADR-0020 stays `Proposed` until then.
5. **Client bundle budget.** Proposed: at most +6 KB gzip for the whole phase, set only after 019 measures
   the baseline.
6. **Manifest version.** ADR-0018 widens `runtimeBinding` without bumping `manifestVersion`, because the
   manifest ships first in 0.5.0 (npm serves 0.2.0 today). If 0.5.0 is published before 020 lands, 020 bumps
   to version 2 with a reader that accepts 1.
7. **`navigate` as a UI action.** Re-expressing navigation through the bridge would simplify the protocol
   but is a breaking change. Deferred to a future protocol version.

## 9. Decisions the owner must confirm

1. Server-declared UI actions only: no page-declared, model-visible actions (ADR-0017).
2. UI actions pause the stream and resume through `POST /session/:id/ui-result`, the confirmation pattern,
   not fire-and-forget (ADR-0017).
3. Form filling is draft-only; submission stays with the user or the `actionRef` write capability (ADR-0018).
4. Page context becomes opt-in by allow-list, with a behaviour change for current integrations that send
   free-form `data` (ADR-0019).
5. Four briefs, 019 to 022, with workflows and the gate last, and voice limited to 014's outcome.
6. Whether 014 is merged before 021.

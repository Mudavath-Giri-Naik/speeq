# Release 0.12 plan — personalised application intelligence and the terminal control center

One release, shipped together on the `next` dist-tag. Internal tasks 022 to 028 are review checkpoints,
not product phases. Owner brief: "SPEEQ should understand the application, recognize the customer,
remember what matters, and help them accomplish their goals — with one developer-controlled
integration."

## 1. Verified starting state (2026-11-28, `main` at 5a15f8b)

- All packages at **0.11.0** in the repo; npm dist-tags `latest: 0.6.0`, `next: 0.11.0`. No pending changesets.
- Baseline `scripts/verify.sh`: recorded in the 022 report (do not quote the "905 tests" figure until re-run).
- Tasks 019 to 021 merged. The commits after 021 (setup wizard, chat box redesign, page path and title in
  the prompt) landed without briefs; 021 is still `briefed` in the index and is closed by this plan.
- Phase 2 tasks 022 (page context, universal agent) and 023 (workflows, gate) were never briefed. This
  plan replaces them; section 5 says what of their scope ships, and what is retained for later.

## 2. What exists and is reused (do not rebuild)

| Need                       | Already there                                                                         | This release                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Server identity            | `resolveUser(request)`, `AgentUser { id }`, `Runtime.authenticate` re-resolves the user on **every** session request and rejects a uid mismatch | Tenant, profile projection, distinct "identity changed" and "auth unavailable" outcomes (ADR-0022) |
| Session tokens             | HMAC tokens `{ sid, uid, exp }` (`server/security/token.ts`)                          | v2 claims add `tid`; v1 still verifies                                          |
| Auth discovery             | `compiler/nextjs/auth.ts` (helper calls, middleware matchers), package detection in `project/integrations.ts` | Provider-specific binding generation with evidence levels (task 026)          |
| Page context               | `getContext`, `useSpeeqContext` registry, `path` and `title`, free-form `data`         | ADR-0019 allow-list finally implemented, plus server context providers (ADR-0023) |
| History                    | Store events rebuilt per session (`agent/history.ts`)                                  | Session, persistent and preference memory modes (ADR-0025)                     |
| Stores                     | `store-memory`, `store-mongodb`, contract tests in `@speeq/testing`                    | Optional scope methods, MongoDB setup in the terminal                          |
| Terminal                   | `speeq setup` wizard (clack 1.9: Back, Skip, review), `.speeq/setup.json`, journal and `speeq rollback`, structural config edits in `integrate/config-switch.ts` | Control center with sections, status, previews, diffs (ADR-0024) |
| Chat box                   | `integrate/ui-template.ts`, black and white, static suggestions, time-of-day greeting  | Server-derived greeting and starters, new conversation, clear memory, identity reset |
| Errors                     | Stable codes, `provider-http.ts` maps 401/403/429/quota                                | Stable `reason` sub-codes and developer diagnostics (ADR-0026)                 |
| Verify and doctor          | `speeq verify`, `speeq doctor`, packed tarball scripts                                 | Identity, context, memory and personalisation checks; fixtures A to D          |

## 3. Decisions (ADRs, Proposed until their task is accepted)

- **ADR-0022** Identity lifecycle: tenant-bound tokens, `IDENTITY_CHANGED`, `AUTH_UNAVAILABLE`, identity probe, client reset.
- **ADR-0023** Context providers and page context: `defineContext`, projection, budgets, `get_context`, prompt layering.
- **ADR-0024** Agent settings and the terminal control center: settings module, presets, greetings, starters.
- **ADR-0025** Memory modes: session, persistent, preferences; scope, clearing, retention.
- **ADR-0026** Provider error reasons: customer message versus developer diagnostics.

## 4. Tasks (one brief each, in order; each brief is written after the previous one is accepted)

| #   | Title                                        | Packages                                   | Depends |
| --- | -------------------------------------------- | ------------------------------------------ | ------- |
| 022 | Identity lifecycle and account isolation     | core, server, client, react, testing       | —       |
| 023 | Context providers and page context allow-list | core, server, client, react, testing      | 022     |
| 024 | Business, presets, greetings, starters, error reasons, chat box | core, server, client, integrate | 023 |
| 025 | Memory modes and stores                      | core, server, client, store-memory, store-mongodb, testing | 022 |
| 026 | Discovery: auth bindings, customer data sources, business facts | compiler, integrate     | 023     |
| 027 | Terminal control center                      | cli, integrate                             | 024 to 026 |
| 028 | Verification, doctor, fixtures A to D, benchmarks, docs, release prep | cli, integrate, fixtures, docs | 027 |

Security-sensitive pieces stay with the architect: token claims and `authenticate` (022), the projection
and sensitive-field screen (023), memory scope checks (025), the telemetry forbidden-fields list (each task).

## 5. Phase 2 scope reconciliation

| Old item                                              | Outcome                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 022 page context allow-list, redaction, storage policy | Ships in 023 (ADR-0019 decisions 1 to 7)                                            |
| 022 tool catalog narrowing for large capability sets  | Retained for later: no eval evidence yet (open question 2); `get_context` keeps prompts small instead |
| 022 universal agent interface                          | Retained for later. Native agent stays the only runtime; no external adapters shown in the terminal |
| 022 voice entry in the registry                        | Ships in 027 as the voice section (existing providers only)                         |
| 023 workflow runner (ADR-0020)                         | Retained for later. Follow-ups, filters and references improve through context and prompt (023, 024) |
| 023 Phase 2 gate report                                | Replaced by `docs/maintainers/release-0.12-report.md` in 028                        |

021 is marked accepted on the evidence of the merged commits (54755b9 and later) and their release.

## 6. Release

Changesets `minor` for every changed package, version 0.12.0, published to `next` by the existing release
workflow. Promotion of `latest` only on the owner's explicit word. 028 runs the packed-tarball install
in a clean external Next.js app.

## 7. Not in this release

External agent frameworks, workflow engine, vector stores, analytics or session replay, a hosted control
plane, a new identity provider, payments, voice cloning, a new chat box design or UI library.

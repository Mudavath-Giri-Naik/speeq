# Release 0.12 report — personalised application intelligence and the terminal control center

Prepared 2026-11-28 by the architect (tasks 022 to 028; Codex unavailable, so every task was built,
verified and self-reviewed by the architect against its brief). All packages move to **0.12.0** on the
`next` dist-tag through the existing Changesets workflow. `latest` stays at 0.6.0 until the owner says
otherwise.

## 1. What shipped

| Area                       | What a developer gets                                                                                                                                                                                                                                                                                                                                        | Task |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| Identity lifecycle         | `resolveUser` re-run on every session request; tenant-bound v2 tokens; `IDENTITY_CHANGED` on logout, account or tenant switch; `AUTH_UNAVAILABLE` when the host's auth fails; `GET /identity` probe; client reset of transcript, confirmations, UI actions and speech; `useSpeeqIdentity`                                                                    | 022  |
| Customer and page context  | `defineContext` sources (identity, ownership, activity, commerce, learning, application, custom) with schema validation, field allow-list projection, restricted-name and secret-value screen, timeouts, budgets, request-scoped cache; built-in `get_context`; page context allow-list; layered prompt (trusted → identity → customer data → page → safety) | 023  |
| Business, style, greetings | `business` profile, `agent.style`, presets, server-side deterministic greetings (guest, member, returning, per page) and capability-filtered starters, stable error `reason`s with customer sentences and a development diagnostic line                                                                                                                      | 024  |
| Memory                     | `memory.mode` session / persistent / preferences; server-chosen resume; transcripts; `remember_preference` in fixed categories with screening; forget or delete; retention; store contract extended (memory and MongoDB stores)                                                                                                                              | 025  |
| Discovery                  | Auth.js v5, NextAuth v4, Supabase Auth, Clerk, Better Auth bindings with evidence levels; customer data source candidates from GET endpoints; business facts from layout metadata, package.json, README                                                                                                                                                      | 026  |
| Terminal control center    | `speeq setup`: status card, twelve sections, ranked recommendation, preview, diff, journaled save, rollback, deep links, `--json`; MongoDB with hidden URI and connection check; setup.json v2; generated `agent.ts`, `identity.ts`, `context.ts`                                                                                                            | 027  |
| Verification               | `verify`/`doctor` personalisation checks P1 to P5, RP1 to RP3, `--live-store` (L1); scenarios A to D; benchmark; packed-tarball run with personalised settings; docs                                                                                                                                                                                         | 028  |

## 2. Reused, not rebuilt

Compiler, manifest and evidence model; integration engine, ownership markers, journal and rollback;
setup wizard steps (provider, voice, languages, chat box) now inside sections 03, 04 and 11; `bindEndpoint`
for endpoint-backed sources; memory and MongoDB stores; the chat box; telemetry allow-list and its tests;
the existing `speeq verify` levels.

## 3. Supported patterns

| Kind           | Automatic                                                                                                                                                                                                                            | Developer-reviewed                                                                                                             | Unsupported                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Sign-in        | Auth.js v5 (`export const { auth } = NextAuth()`), NextAuth v4 (`authOptions` outside route files), Supabase Auth (`createServerClient` wrapper, `getUser()`), Clerk (with `clerkMiddleware`), Better Auth (`betterAuth()` instance) | `authOptions` in a route file, Kinde, your own `getCurrentUser`-style helper                                                   | Firebase Auth (no standard server session), any package without server code                |
| Customer data  | GET endpoints matching customer-data paths with no required inputs, called with the visitor's cookies, approved fields only                                                                                                          | Endpoints without a visible sign-in check (explicit confirmation); fields not visible in literal `json({...})` (typed by hand) | Endpoints with path or required query parameters (write `defineContext`), server functions |
| Business facts | Layout `metadata`, package.json description and homepage, README heading and paragraph                                                                                                                                               | Package name (hint only), anything else (you type it)                                                                          | —                                                                                          |

## 4. Security and privacy

- The server decides identity on every request; browser-sent ids, roles and emails are ignored (tests).
- User ids, tenant ids and emails never reach the model or browser; profile fields only when exposed.
- Customer data: allow-list projection, restricted names and secret-looking values dropped, bounded size;
  restricted fields can never be approved in the terminal; endpoints without auth evidence need review.
- Memory scoped to user and tenant, checked in the server, not the store; forgotten sessions answer
  `SESSION_EXPIRED`; preferences are hints, never proof of ownership; no anonymous memory.
- Prompt layering keeps all customer, page, preference and tool data below trusted instructions and
  above the safety rules, escaped as data.
- Telemetry: forbidden-fields tests extended to identity, context, greetings, preferences and memory.
- Errors: provider bodies never reach clients; keys and prompts never logged.
- Terminal: keys and MongoDB URIs hidden on input, never printed, stored only in `.env.local`
  (git-ignored); setup.json carries choices only and is validated before it is rendered into code.

Security regression tests cover every attack in spec §43 (fake user id or admin role, another
customer's cart or courses, anonymous private data, reused session after logout, customer B on A's
browser, tenant switch mid-conversation, prompt injection in tool results, display names and product
descriptions, unexpected sensitive fields, oversized and slow sources, unavailable sources, outdated
memory, provider error with a key, private context in telemetry, pending confirmation across an account
switch, in-flight responses after logout, unauthorised UI actions).

## 5. Test results (actual)

`scripts/verify.sh` on the release branch: lint ✅, typecheck ✅, tests **1078 passed, 0 failed**, build ✅.
Baseline before the release (5a15f8b): 905 tests. Packed-tarball external Next.js run
(`scripts/pack-all.sh && scripts/pack-cli-test.sh`): **PASS** (npm install of the tarballs in a clean Next.js app, scan, init, repeated init is a no-op, verify static and runtime pass, `tsc --noEmit`, then personalised settings saved through the packed `@speeq/integrate`, wired into `speeq.config.ts`, compiled with `tsc --noEmit`, `speeq setup --json` reads them, verify RP3 memory isolation passes, `verify --run-host` passes, two rollbacks restore the tree byte for byte). This run caught the chat-box type error described in section 7, which is fixed.

Scenario tests (`packages/server/test/scenarios.test.ts`) run spec §42 end to end through the HTTP
handler with a scripted model: A education (anonymous → sign-in → enrolled courses → navigate →
current question → language → resume with preference → logout), B e-commerce (cart greeting, follow-up
filters, prompt injection in results, confirmed add-to-cart, account switch without leakage), C SaaS
(subscription, admin action denied, organisation switch isolates data and memory), D static site (no
identity, navigation only). They use in-memory app services, not a running Next.js app or real users.

## 6. Performance (measured, `packages/server/scripts/bench-personalisation.ts`)

```text
N=300 per mode, Node 24.15.0, mock model (no latency), in-memory store
identity probe ms          plain 0.06 (p95 0.12)        personalised 0.17 (p95 0.48)
session create ms          plain 0.18 (p95 0.58)        personalised 0.27 (p95 0.44)
turn first byte ms         plain 0.23 (p95 0.49)        personalised 0.21 (p95 0.34)
turn total ms              plain 0.35 (p95 0.70)        personalised 0.41 (p95 0.62)
system prompt chars        plain 3906                   personalised 5228
≈ prompt tokens            plain 977                    personalised 1307
model calls per turn       plain 1                      personalised 1
context fetches per visit  plain 0                      personalised 3
rss growth MB              plain 17.3                   personalised 21.1
```

Mock model with no latency, in-memory store, in-process requests: these numbers are speeq's own
overhead, not model or network time. Personalisation adds about 330 prompt tokens in this setup
(business profile, profile, one initial context source, preferences, style lines), no extra model calls,
and well under a millisecond per request. A greeting that uses a `{source.field}` placeholder fetches
that source on each identity probe and session; probes are throttled and rate limited. No LLM call is
made for identity, discovery or greetings.

## 7. Compatibility and migration

Without the new settings an app behaves as 0.11: anonymous use, greetings, tools, history, speech, UI
bridge. v1 session tokens verify; stored sessions without a tenant read as `null`; setup.json v1 reads
and stays v1 until control-center settings exist. Store adapters without the new optional methods keep
working in session mode and fail clearly at startup in persistent modes. No breaking API changes; new
protocol fields are optional. Clearing is `POST /session/:id/clear-memory` so existing generated route
files (GET, POST, OPTIONS) need no change.

Fixed during release verification: the generated chat box (since 0.11) passed a `getContext` of the
wrong shape, which failed strict type checks in host apps (`next build`). It is removed; the client
sends path and title itself.

## 8. Remaining limitations and deferred work

- Not validated against a real SwaSeekh or production app, real sign-in providers or real customers;
  the end-to-end demonstration (spec §51) is for the owner to run with `npx speeq@next setup`.
- Generated sign-in bindings are verified for types and behaviour with a test user, not against a live
  provider login (status stays "generated" until verified in the app).
- Customer data discovery covers GET route handlers; server functions and parameterised endpoints need
  a few lines of `defineContext`.
- Home screen rows are about 80 columns wide; the 60-column target in ADR-0024 §7 is not met.
- Optional AI-generated greetings, AI-assisted business suggestions, a session-scoped activity registry
  for apps without activity tracking, and fallback LLM providers were not built (deterministic only).
- Deferred from Phase 2 (plan §5): universal agent interface, workflow runner (ADR-0020), tool catalog
  narrowing. Task 023's broader workflow acceptance criteria are not claimed.

## 9. Release instructions

1. Review and merge `main` (all task branches are fast-forwarded; changesets are in `.changeset/`).
2. The release workflow opens "Version Packages" (all packages 0.12.0). Merge it to publish on `next`.
3. Smoke test: `npx speeq@next --version` prints 0.12.0; in a Next.js app run `npx speeq@next init`,
   `npx speeq@next setup`, `npx speeq@next verify`.
4. Promote to `latest` only on the owner's explicit word: `npm dist-tag add speeq@0.12.0 latest` (and the
   `@speeq/*` packages).

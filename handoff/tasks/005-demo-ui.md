# TASK 005 — Demo UI: assistant widget, audit page, e2e

Branch: task/005-demo-ui (create it from latest `main`; 004 is already merged)

## 1. Read first

- `AGENTS.md` (rules, commit rules) and `PLAN.md` §3 and §5.
- `handoff/tasks/004-demo-wiring.md` and `handoff/reports/004-demo-wiring.md` (what the demo already has).
- `handoff/reports/003-react.md`, `packages/react/src/{index,provider,hooks,audit-hooks}.ts(x)` and `packages/react/README.md` (hook API).
- `packages/client/src/types.ts` (snapshot, options, events) and `packages/client/src/audit.ts` (`SessionSummary`, `ConversationEvent`, `AuditListParams`).
- `apps/demo/app/layout.tsx`, `apps/demo/lib/{demo-auth,routes,mock-rules,mock-replies,speeq-config,tools}.ts`, `apps/demo/app/globals.css`.

## 2. Goal

The demo site gets a working Vidya assistant: a floating widget (mic button, transcript, language
menu, text input, confirmation dialog, "mock mode" badge) available on every page, and an
admin-only `/admin/conversations` page that lists recorded sessions and shows each session's
event history. One Playwright test proves the whole loop in mock mode with typed input.

## 3. Decisions already made (do NOT change or re-decide)

- **No new dependencies in the app except `@playwright/test` (devDependency of `apps/demo`).** No UI kit, no CSS framework, no icon package. Plain React, plain CSS appended to `globals.css` (or a new `widget.css` imported by the layout). Inline SVG for icons.
- **The widget is the only client-component surface.** Pages stay server components. Create `apps/demo/components/` with:
  - `assistant.tsx` — `"use client"`; wraps children of the layout? **No.** It renders `<SpeeqProvider>` plus the widget UI and is mounted once in `app/layout.tsx` next to `{children}` (as a sibling, not a wrapper), so pages remain server-rendered.
  - Split into small files if it gets long: `assistant.tsx` (provider + navigation wiring), `widget.tsx` (panel UI), `confirm-dialog.tsx`, `transcript.tsx`.
- **Provider config:** `endpoint="/api/speeq"`, `languages={["en-IN","te-IN","hi-IN"]}`, default `language="en-IN"`, `persistSession="sessionStorage"`, defaults for speech (Web Speech) and `speakReplies`.
- **Navigation:** `onNavigate` calls `router.push(action.href)` from `next/navigation` (`useRouter`). The widget stays open across navigation (it lives in the layout, so it persists naturally).
- **Page context:** a tiny client component `QuestionContext` (`"use client"`, calls `useSpeeqContext({ questionId })`) is rendered by `app/questions/[id]/page.tsx` so that "bookmark this question" works. The context data shape must be exactly `{ questionId: number }` (the mock rules in `lib/mock-rules.ts` read `data.questionId`). Do not change the mock rules.
- **Confirmation is mandatory UI:** when `pendingConfirmation` is non-null, show a modal dialog (`role="dialog"`, `aria-modal="true"`, labelled by its title) with the `summary`, an **Approve** and a **Decline** button, calling `confirm(id, true|false)`. Focus moves to Decline when it opens (safe default); `Escape` declines. The user can never approve implicitly (no auto-confirm, no timer).
- **Mock badge:** the widget shows a "Mock mode" badge only when the server reports mock. Do this by reading `config` from the snapshot **if it carries a mock flag**; if it does not, add a tiny server component prop instead: `app/layout.tsx` (server) computes `mode` via the existing `selectLlm`/`getDemoSpeeq` exports (read `apps/demo/lib/speeq.ts` for what is exported; add one exported function `getLlmMode(): "groq" | "gemini" | "mock"` there if none exists) and passes `llmMode` to `<Assistant llmMode=… />`. Never send keys or env values to the client, only the mode string.
- **Admin page:** `app/admin/conversations/page.tsx` is a **server component** that calls `getCurrentUser()`; if the user is not an admin it renders a 403-style message with a link to `/login` and **does not** render the client list component (do not rely on client checks; the audit endpoints are already admin-gated by `audit.authorize`, this is only UX). If admin, it renders a client component `audit-browser.tsx` that uses `useAuditSessions` and `useAuditSession` from `@speeq/react` with `endpoint="/api/speeq"` and `credentials="include"`.
  - List: user id (or "anonymous"), started time, language, turn/message count if `SessionSummary` has it (use only fields that exist; check the type), "Load more" when `hasMore`, "Refresh" button, loading and error states.
  - Detail: selecting a session loads its events and renders them in order as a readable timeline (user text, assistant text, tool call name + a short result, confirmation requested/approved/declined). Render unknown event types as a muted `type` line, never crash on them. Escape all content (React does by default; do not use `dangerouslySetInnerHTML`).
  - Add an "Admin" link to the header nav **only** when the user is admin (layout already has `user`).
- **Accessibility floor:** every control has an accessible name; transcript is `role="log"` with `aria-live="polite"`; the mic button uses `aria-pressed`; the widget panel toggle uses `aria-expanded`. Respect `prefers-reduced-motion` (no animation when set).
- **Speech fallback:** when `support.speechInput` is false the mic button is disabled with a visible hint ("Voice input isn't supported in this browser. Type instead."); typing always works. Show `interimTranscript` while listening. Language menu is a native `<select>` bound to `setLanguage`; when `support.voiceForLanguage === false` show a small warning that no voice is installed for that language (replies still appear as text).
- **State display:** show the current `state` (idle/listening/thinking/speaking) as visible text, and a Stop button during `thinking`/`speaking` that calls `cancel()`.
- **Errors:** if `snapshot.error` is set show its `message` (already public-safe) in an alert region with a retry-by-sending-again hint. Never show raw objects or stack traces.
- **e2e:** `apps/demo/e2e/assistant.spec.ts` with `apps/demo/playwright.config.ts`. The config starts the app itself with `webServer` (`pnpm --filter @speeq/demo start` after a build is **not** assumed: use `next dev -p 3107` with env `SPEEQ_SECRET=e2e-secret-e2e-secret-e2e-secret`, `DEMO_ADMIN_PASSWORD=e2e-admin`, `SPEEQ_LLM=mock` (use whatever env name `lib/llm.ts` actually reads; check it), and **no** `GROQ_API_KEY`/`GEMINI_API_KEY`/`MONGODB_URI`), `reuseExistingServer: !process.env.CI`, Chromium only. Add script `"test:e2e": "playwright test"` to `apps/demo/package.json` (the root `test:e2e` already filters to the demo). **e2e is NOT part of `scripts/verify.sh`** (browsers are a heavy download); document `pnpm --filter @speeq/demo exec playwright install chromium` in `apps/demo/README.md`.
- Do not change server, client or react packages. If you believe one needs a change, stop and say so in the report instead.

## 4. Scope

Create:
- `apps/demo/components/{assistant,widget,transcript,confirm-dialog,question-context,audit-browser}.tsx` (split as needed)
- `apps/demo/app/admin/conversations/page.tsx`
- `apps/demo/e2e/assistant.spec.ts`, `apps/demo/playwright.config.ts`
- `apps/demo/test/ui.test.tsx` (component tests, see §7) and any vitest config tweaks needed for `.tsx`/jsdom **scoped to that file** (`// @vitest-environment jsdom` docblock; add `jsdom` and `@testing-library/react` as devDependencies of the demo only if you need them — prefer `react-dom/server` + `react-dom/test-utils`-free tests if you can keep it small)

Modify:
- `apps/demo/app/layout.tsx` (mount `<Assistant>`, Admin link)
- `apps/demo/app/questions/[id]/page.tsx` (render `<QuestionContext questionId={…} />`)
- `apps/demo/app/globals.css` (widget + admin styles)
- `apps/demo/lib/speeq.ts` only if `getLlmMode` is needed (see §3)
- `apps/demo/package.json`, `apps/demo/README.md`, `.gitignore` (Playwright output dirs), `pnpm-lock.yaml`, `handoff/reports/005-demo-ui.md`

Do NOT touch: `packages/**`, `apps/demo/lib/{mock-rules,mock-replies,demo-auth,tools,routes,llm}.ts` (except the one allowed `speeq.ts` addition), `handoff/INDEX.md`, the user's local `.env.example` edits (never stage or commit `.env.example`; it contains private local values).

## 5. Requirements (numbered, each testable)

1. A floating launcher button (bottom-right) toggles the assistant panel on every page; `aria-expanded` reflects state; the panel is closed by default on first load.
2. Typing a message and pressing Enter (or clicking Send) calls `sendText`; the input clears; Send is disabled when the input is blank or state is `thinking`.
3. The transcript renders `messages` in order with distinct user/assistant styling, shows `streaming` text as it grows, marks `interrupted` messages, and shows `error` messages as errors.
4. Mic button: toggles `startListening`/`stopListening`; disabled with the hint when `support.speechInput` is false; shows interim transcript while listening.
5. Language `<select>` lists the client's `languages` with labels English / తెలుగు / हिन्दी, bound to `language` and `setLanguage`.
6. A pending confirmation opens the modal dialog described in §3; Approve/Decline call `confirm` with the right id and boolean; Escape declines; focus starts on Decline and is kept inside the dialog while open.
7. "Take me to pricing" in mock mode navigates the browser to `/pricing` without a full reload, and the widget remains open.
8. On `/questions/12`, "bookmark this question" triggers the confirmation dialog for question 12; Approve makes the assistant reply with the bookmarked message; Decline makes it reply with the declined message.
9. `/admin/conversations` for a non-admin or signed-out visitor shows the access-denied message and renders no session data and no audit requests are made.
10. For an admin, the page lists the sessions created during the test (at least the e2e conversation), and opening one shows its event timeline including the tool call to `navigate` and the confirmation events.
11. The header shows an "Admin" link only for the admin user.
12. The mock badge appears iff mode is `mock`.
13. SSR: with JS disabled the pages still render (the widget simply is not interactive); `next build` has no hydration warnings from the widget (server HTML must not depend on `window`, `navigator` or `sessionStorage`).

## 6. Contracts

```ts
// components/assistant.tsx
export function Assistant(props: { llmMode: "groq" | "gemini" | "mock" }): JSX.Element;

// components/question-context.tsx
export function QuestionContext(props: { questionId: number }): null;

// components/audit-browser.tsx
export function AuditBrowser(): JSX.Element;

// lib/speeq.ts (add only if missing)
export function getLlmMode(): "groq" | "gemini" | "mock";
```

Stable test hooks (use exactly these `data-testid` values; the e2e and unit tests rely on them):
`assistant-toggle`, `assistant-panel`, `assistant-input`, `assistant-send`, `assistant-mic`,
`assistant-language`, `assistant-state`, `assistant-transcript`, `assistant-mock-badge`,
`confirm-dialog`, `confirm-approve`, `confirm-decline`, `audit-denied`, `audit-session-row`,
`audit-timeline`, `audit-load-more`.

## 7. Tests required

Unit/component (vitest, `apps/demo/test/ui.test.tsx`; mock `@speeq/react` hooks or pass a fake
`SpeeqClient` via `SpeeqProvider client={…}` — you choose, keep it simple):
- Widget renders closed by default; toggle opens it; `aria-expanded` flips.
- Send disabled for blank input and while `thinking`; Enter submits; input clears.
- Mic disabled with hint when `support.speechInput` is false; enabled otherwise; click calls start/stop.
- Confirmation dialog: shows summary; Approve → `confirm(id, true)`; Decline → `confirm(id, false)`; Escape → decline; initial focus on Decline.
- Error snapshot shows the public message only.
- Mock badge shown for `llmMode="mock"`, absent for `"groq"`.
- `AuditBrowser`: renders rows from a faked audit client, "Load more" appears only when `hasMore`, unknown event type renders without throwing, an error state renders.
- Admin page access: unit-test the server logic by extracting a pure `canViewAudit(user)` helper (admin only; `null` and student false) in `lib/audit-access.ts`.

e2e (Playwright, `apps/demo/e2e/assistant.spec.ts`, one `test.describe`, mock mode, typed input only):
1. Open `/`, open widget, type "take me to pricing" → URL becomes `/pricing`, widget still open, assistant reply contains "pricing" (case-insensitive).
2. Sign in as a student on `/login`, open `/questions/12`, type "bookmark this question" → dialog appears mentioning 12; Decline → declined reply; type again → Approve → bookmarked reply.
3. Signed-out visit to `/admin/conversations` shows `audit-denied`; student also sees it.
4. Sign out, sign in as admin with `e2e-admin` (check the login form in `app/login/page.tsx` for the exact fields), visit `/admin/conversations` → at least one `audit-session-row`; open the newest → `audit-timeline` contains the text `navigate` and a confirmation entry.

Failure/edge cases to cover explicitly: speech unsupported (e2e Chromium headless has no recognizer: assert the mic is disabled with the hint), network failure of `/api/speeq` (unit: error snapshot shown, input still usable), double-click on Approve sends exactly one `confirm`.

## 8. Acceptance

- `scripts/verify.sh` passes (lint, typecheck, unit tests, build). Fix Biome formatting with `pnpm lint:fix`.
- `pnpm --filter @speeq/demo exec playwright install chromium` then `pnpm --filter @speeq/demo test:e2e` passes locally. Paste the pass count in the report.
- Manual smoke (report it): `pnpm --filter @speeq/demo dev`, open the widget, send a message, confirm no console errors or hydration warnings.
- `git diff --stat` touches only §4 files. `.env.example` is not staged. No secrets in any file.

## 9. Finish

Commit on the branch (Conventional Commits, no attribution lines of any kind, no Co-Authored-By).
Write `handoff/reports/005-demo-ui.md` using `handoff/REPORT_TEMPLATE.md` and print it at the end.
Do not merge to main. Do not push. Do not edit `handoff/INDEX.md`.

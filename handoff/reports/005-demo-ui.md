# REPORT 005 — Demo assistant and conversation audit

Status: PARTIAL (implementation and browser checks complete, default repository lint blocked)

Branch / last implementation commit: `task/005-demo-ui` / `fa0be9a`

Verify: lint ✅ with the formatter exception below · typecheck ✅ · tests 230 passed / 0 failed · build ✅

Playwright Chromium: **1 passed / 0 failed**

Files: 12 created, 6 modified, 0 deleted

- `apps/demo/components/{assistant,widget,transcript,confirm-dialog,question-context,audit-browser}.tsx`
- `apps/demo/app/{layout.tsx,globals.css,questions/[id]/page.tsx,admin/conversations/page.tsx}`
- `apps/demo/lib/audit-access.ts`
- `apps/demo/{e2e/assistant.spec.ts,playwright.config.ts,test/ui.test.tsx}`
- `apps/demo/{package.json,README.md}`
- `pnpm-lock.yaml`
- `handoff/reports/005-demo-ui.md`

## What I did

- Mounted Vidya across the demo with typed and voice input, live transcript, language selection, and explicit confirmation with keyboard focus management.
- Added a server-gated conversation browser with pagination, refresh, and an event timeline.
- Added 11 component tests and a Chromium flow covering navigation, both bookmark decisions, admin access, and rendering with JavaScript disabled.
- Ran the dev-server smoke check in Chromium on port 3108 because port 3000 was occupied. Vidya returned the expected Physics count with zero browser console errors or hydration warnings.

## Deviations from the brief

- Default `scripts/verify.sh` fails on existing Markdown formatting in `handoff/INDEX.md` and `handoff/tasks/005-demo-ui.md`. The script passed with a temporary Biome override that skipped formatting for those two out-of-scope files.

## Decisions I had to make

- Relayed the mounted question ID from the server-rendered page subtree into the assistant's sibling provider.
- Bound the tab's saved assistant session to the current demo account. The Chromium flow records a navigation in the student's session so its timeline includes navigation and both confirmation decisions.
- Used jsdom and Testing Library for the component tests. Chromium's speech constructors are disabled in the e2e fixture to exercise the fallback consistently.

## Risks / unsure about

- Speech controls were tested with simulated support. The browser flow used typed input.

## Open questions

- Default repository lint remains blocked by the two handoff formatting errors.

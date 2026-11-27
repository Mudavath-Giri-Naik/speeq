# REPORT 019 — UI bridge: contract, server runtime, client registry, React hook, feature entry

Status: DONE
Branch / last commit: task/019-ui-bridge / see git log (built by the architect, not Codex)
Verify: lint ✅ · typecheck ✅ · tests 782 passed / 0 failed · build ✅ (`scripts/verify.sh`). Also `pack-all.sh` + `pack-test.sh` ✅, Playwright `ui-bridge` 2/2 ✅ and the existing e2e ✅.
Files: 11 created, 29 modified (see `git diff --stat main`)
What I did:
- Core: `ui.action` event, `UiResultRequest`, `capabilities` on session creation, audit events `ui.action.requested/resolved`, `SessionCapability`, `UiResultStatus`, turn end reason `ui_action_required`.
- Server: `defineUiAction`, `uiActions` config, `agent/ui.ts` (validation, limits, request, supersede), `handler/ui.ts` (`POST /session/:id/ui-result`, atomic claim through `dedupeKey: ui:<callId>`), per-turn tool list for opted-in sessions only.
- Client: `registerUiAction`, `pendingUiAction`, `resolveUiAction`; `capabilities` sent only when a handler is registered at session creation; `ui.action` added to the known event set.
- React: `useSpeeqAction`, `resolveUiAction` on `useSpeeq`. Registry: `ui-bridge` feature (off by default). Testing: `startSession({ capabilities })`, `session.uiResult()`.
- Demo: `ui_set_text_size` (read) and `ui_reset_preferences` (write, confirm) with browser handlers, reused confirm dialog, mock rules, e2e.
- Docs: `docs/concepts/ui-actions.md`, README sections, changeset.
Deviations from the brief:
- Limits are `guardrails.uiActionsPerTurn/uiActionsPerSession` (the config already has `guardrails`), not a new `limits` key.
- Config errors use `NOT_CONFIGURED` (what `resolve.ts` uses); `VALIDATION_ERROR` does not exist and the brief forbade new codes.
- Added `ui_action_required` to `TurnEndReasonSchema` (`common.ts`), which the brief's contract needed but did not list.
- Modified `@speeq/testing` (`startSession` option and `uiResult`), `apps/demo/test/ui.test.tsx` (new `resolveUiAction` field) and `packages/client/test/client.test.ts` (snapshot field).
- No page was added to `apps/docs` (the site has its own `content/` and nav); only `docs/` and READMEs.
Decisions I had to make (please review):
- Per-session cap counts `ui.action.requested` in the last 300 events, so it is best effort on very long sessions (it is a flood guard, not authority).
- A rejected UI call (invalid args, limit) goes through `recordOutcome`, so it counts as a `custom` tool call in existing telemetry counters; no new counter or field.
- `ui.action.requested` is written with `recordStrict`: if it cannot be stored the turn fails rather than sending an action that could never be answered.
Risks / unsure about:
- Approval of `write` actions is enforced by the client the developer ships; documented as protection from the model, not from a user editing their browser.
- A handler registered after session creation is only offered from the next session (documented).
Gate G7 numbers (gzip -9 of `dist/index.js`): `@speeq/client` 20 785 -> 21 319 B (+534 B); `@speeq/react` 2 196 -> 2 265 B (+69 B).
Open questions: none new. Plan open question 5 (bundle budget): +0.6 KB so far against the proposed +6 KB for the phase.

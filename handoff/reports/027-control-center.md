# REPORT 027 — Terminal control center

Status: DONE (built by the architect; ADR-0024 accepted with amendments)
Verify: lint ✅ · typecheck ✅ · tests 1068/0 · build ✅
Files: created `integrate/src/{agent-settings,settings-plan}.ts`, `cli/src/control/{state,sections,home,mongo}.ts`,
tests `integrate/test/agent-settings.test.ts`, `cli/test/control.test.ts`, guide `docs/guides/control-center.md`,
changeset; modified integrate setup (v2), plan (keeps v2 keys on remember), index; cli setup command, wizard
(exports `runStep`, extra env names), init next steps, args help, `cli/test/connect.test.ts`; `docs/reference/cli.md`,
ADR-0024.

What I did:

- setup.json v2 with validated agent, business, preset, greeting, starters, memory, store, identity, context and
  verifiedAt; v1 still reads and is written until v2 keys exist; `init`/`upgrade` keep the v2 keys.
- `renderAgentModule` (sealed, JSON-quoted values, lazy MongoDB client), `wireAgentSettings` (structural, idempotent,
  reports overrides, refuses unknown shapes with a manual snippet), `planSettingsSave` (re-checks every approved
  source with `contextSpec` against fresh discovery; journaled).
- `sectionStatuses` and `recommend` (pure, tested). Home, twelve sections with Back and Help, preset guess with
  reasons, business facts with file:line, auth table with levels and notes, source detail view with restricted
  fields, greeting preview with sample data, memory and storage, checks via `verifyProject`.
- MongoDB: hidden URI, `.env.local` (+ .gitignore), optional connection and write probe with the app's driver.

Deviations: one Save for all sections instead of a save per section; `init` prints a pointer to `speeq setup`
rather than opening the home screen; home rows are about 80 columns wide (the 60-column target is not met);
no `taskLog` component, spinners with timings are used instead.
Decisions: renaming the agent regenerates the chat box before the settings save, so one rollback undoes the save.
Risks: `agentProfile` replaces only the exact one-line agent object `init` writes; other shapes keep their keys
and those keys are reported as overrides.
Open questions: none

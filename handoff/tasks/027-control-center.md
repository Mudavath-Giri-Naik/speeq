# TASK 027 — Terminal control center

Branch: task/027-control-center (from main at e87086e)

## 1. Read first

ADR-0024 (all, especially §7 the experience bar), ADR-0025 §7 (MongoDB in the terminal), reports 024 to 026,
`cli/src/commands/setup.ts`, `cli/src/wizard.ts`, `integrate/src/{config-switch,apply,setup,personal}.ts`.

## 2. Goal

`speeq setup` manages the whole agent from the terminal and changes real files: settings in setup.json v2, a
server-only `agent.ts` spread into `createSpeeq`, generated `identity.ts` and `context.ts`, MongoDB env values.

## 3. Decisions

- Home: status card, twelve sections with badge (symbol and word), one recommendation ranked broken > security
  review > unbound detection > persistence > polish. Home prompt keeps the 0.11 ids (`model`, `voice`, `chat`,
  `apply`, `cancel`) so the wizard steps live on inside sections 03, 04 and 11.
- Draft, then one Save: diff per file, one confirmation, `applyPlan` journal, receipt with restart hint and
  `speeq rollback`. Wizard choices (env, provider switch, chat-box regeneration) apply first, settings second.
- `agent.ts` exports `agentProfile` (replaces the one-line agent object `init` writes, otherwise spread first
  inside a hand-written agent) and `agentSettings` (spread first in `createSpeeq({`). Overrides are reported.
  The init in-memory `store,` is removed only when MongoDB is chosen.
- setup.json v2 values are validated on read (they are rendered into code with JSON quoting only).
- MongoDB: hidden URI, `.env.local` only, optional check with the app's own driver (ask before install): ping,
  one insert and delete in `speeq_probe`; messages scrubbed of URIs and credentials.
- `speeq setup <section>` deep-links; `speeq setup --json` prints state without secrets.

## 7. Tests required

v2 read sanitization (hostile strings stay data), v1/v2 write; wiring (init agent replaced, hand-written agent
kept with overrides, mongo store removal, idempotent, refusal); statuses and ranking; save → type-check →
idempotent → rollback; edited agent.ts needs force. CLI: home and recommendation, full personalisation flow with
restricted field never offered, rollback, MongoDB URI never printed, invalid URI, unsaved-changes guard, deep
link and unknown section, JSON state. Existing setup tests adapted to the section menus.

## 8. Acceptance

`scripts/verify.sh` passes.

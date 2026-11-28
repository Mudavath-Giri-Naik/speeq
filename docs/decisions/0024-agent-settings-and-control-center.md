# ADR-0024 — Agent settings live in one CLI-owned module; `speeq setup` is the control center

Status: Accepted (tasks 024 and 027). Amended in 027: edits go to a draft and one Save reviews all of them
(instead of a save per section); `agent.ts` exports `agentProfile` (spread into `agent`) and `agentSettings`;
an `agent.ts` edited by hand is overwritten only after an explicit yes; `init` stays linear and points to
`speeq setup` instead of opening the home screen; status `✕ broken` covers a missing provider key or MongoDB URI.

## Context

Developers want to change name, personality, instructions, greetings, starters, memory, model and voice
from the terminal and see the app change. `speeq.config.ts` is the developer's file; regex edits of
free-form TypeScript do not scale to twenty settings and break custom code.

## Decision

1. **Choices in `.speeq/setup.json` v2** (no secrets, no values; v1 is read and upgraded). New keys:
   `agent`, `business`, `preset`, `style`, `greeting`, `starters`, `memory`, `context` (review decisions per
   discovered source), `identity` (expose list, chosen binding).
2. **One CLI-owned module** `<generatedDir>/agent.ts` (owned-file header like `routes.ts`), rendered from
   setup.json, exporting `agentSettings` typed `AgentSettings` from `speeq/server`. It is server-only
   (imported by `speeq.config.ts`, never by client code). One structural edit adds
   `...agentSettings,` as the first property of `createSpeeq({`. Developer properties written after the
   spread win; the CLI detects such overrides and reports them as conflicts instead of claiming success.
3. **New `SpeeqConfig` fields** (all optional; absent = 0.11 behaviour):
   `agent.style { personality, responseLength, explanationDepth, nameUsage, followUps }`,
   `agent.instructions` (developer text, unchanged meaning), `business { name, description, industry,
   audience, offerings[], terminology[], support }`, `greeting { … }`, `starters [ … ]`,
   `identity { expose }`, `context { page, providers, budget }`, `memory { … }`.
   Style maps to fixed prompt lines; no setting can remove the safety section, validation or
   confirmation, which are appended by code, not by settings.
4. **Greeting and starters are computed on the server, deterministically**, and returned in
   `ClientConfig` (`greeting: { text, starters: { label, prompt }[] }`) from `POST /session` and the
   identity probe. Templates per state (`guest`, `member`, `returning`, per route id) with placeholders
   from exposed identity fields and `greeting` fields of `initial` providers only. A template whose
   placeholder has no value is skipped for the next one; no LLM call, no invented names or counts.
   Starters declare `when: { auth?, routes?, requires? }`; `requires` lists capability ids (route, tool,
   UI action, provider) and a starter whose capability is missing is never shown.
5. **Presets are data** (`integrate/presets.ts`): general, ecommerce, education, admissions, saas,
   logistics, support, custom. A preset fills style, greeting templates, starter candidates and suggested
   context categories. It never enables a provider, tool or field on its own; the developer approves each.
6. **The control center.** `speeq setup` opens a home screen: a status card (project, framework, SDK,
   model, voice, auth, memory, last verification) and twelve sections, each with a live badge
   (`✓ set`, `! review`, `○ off`, `✕ broken`) and one deterministic "recommended next step".
   `speeq setup <section>` deep-links. Every section ends in: preview (synthetic data only) → diff →
   save through the integration journal (`speeq rollback` undoes it) → what to restart. First-run `init`
   still uses the linear wizard, then shows the home screen. Non-TTY: `speeq setup --json` prints state.
   A section is listed only when its feature exists; unavailable ones show why.

7. **The terminal experience bar** (owner priority: structured, intelligent, delightful). Task 027 is
   accepted only if it meets all of these:
   - **Home first.** A `box()` status card, then sections in a fixed order, each one line:
     `05  Authentication and identity   ✓ Supabase Auth, bound and verified`. Nothing to read twice.
   - **One recommendation, ranked deterministically** from state (broken > security review > unbound
     detection > missing persistence > polish), with the reason and the time it takes:
     `Recommended  Bind Supabase Auth so the agent knows who is signed in  (about 1 minute)`.
   - **Smart defaults from the scan, with evidence.** Business name from metadata, preset guessed from
     routes and tools (`/courses`, `enroll` → Education, "because …"), auth from source files with
     line numbers. The developer confirms; nothing is assumed silently.
   - **Show, don't describe.** Greeting previews for guest, member and returning visitor side by side;
     a sample system-prompt outline with sizes; context sources as a table with fields marked
     approved / excluded / restricted. Synthetic data only, never real records.
   - **Every save is a reviewed diff** (coloured, minimal), then a receipt: what changed, what to
     restart, `speeq rollback` to undo.
   - **Live checks feel alive.** `taskLog`/spinners with timings for key tests, Mongo ping, binding test;
     failures show the stable reason and one fix.
   - **Never stuck.** Back, Skip and Cancel on every screen, `?` help per screen, Ctrl-C writes nothing.
   - **Accessible and robust.** Status by symbol and word (not colour alone), `NO_COLOR`, works at 60
     columns, plain output and `--json` without a TTY, secrets never echoed.

## Alternatives rejected

- Editing `speeq.config.ts` for every setting: fragile, overwrites developer code.
- A JSON file imported by the config: no types, no comments, and JSON imports vary by bundler.
- A remote configuration service: violates the developer-owned principle.

## Consequences

Two files to know (`speeq.config.ts`, the developer's; `agent.ts`, the CLI's). Hand edits to `agent.ts`
are overwritten by the next save, which its header says, and `setup` warns before doing so.

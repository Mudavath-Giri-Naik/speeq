# TASK 021 — Zero-code onboarding: provider choice, env names, generated chat UI with voice

Branch: task/021-zero-code-onboarding (from main). Requested by the owner 2026-11-27 during task 020.

## 1. Read first

`AGENTS.md` principles 1, 2, 4; ADR-0016 (ownership, anchored splices, journal); ADR-0014; `packages/integrate/src/{plan,render,registry,apply}.ts`;
`packages/cli/src/commands/init.ts`, `review.ts`, `prompts.ts`; `apps/demo/components/{widget,transcript,confirm-dialog}.tsx` (the reference UI to port);
`docs/reference/environment.md`, `guides/voice-providers.md`.

## 2. Goal

In a Next.js App Router app, `npx speeq init` alone produces a working assistant with a chat box, text and voice,
without the developer writing code. It asks which model provider to use, writes the **names** of the needed
environment variables into `.env.local` (and `.env.example`) so the developer only pastes a key, and wires the
widget into the root layout. Then `npm run dev` shows the assistant.

## 3. Decisions already made (do NOT re-decide)

- **Packages stay headless** (principle 2). The UI is **generated code in the host app**, like a component
  library's CLI: an owned file `components/speeq/assistant.tsx` (marker + hash, ADR-0016) rendered from a template in
  `@speeq/integrate`. The developer can take it over by deleting the marker line. No visual component ships in any
  runtime package.
- **Env files**: speeq writes variable **names with empty values** and a comment, never a key or token. Existing
  values are never read into output or changed; only missing names are appended. `.env.local` is created if
  missing and `.gitignore` gets `.env*.local` if absent. `.env.example` gets the same names. The only generated
  value is `SPEEQ_SECRET` (random, 48 characters, produced locally with `crypto.randomBytes`), because it is not
  user data and a missing secret blocks production; it is written only if absent.
- **Providers (registry data)**: `mock` (default, no key), `groq` (OpenAI-compatible preset), `openrouter`,
  `gemini`, `openai-compatible` (custom base URL, e.g. Ollama). Model ids and base URLs come from env names
  (`SPEEQ_LLM_MODEL`, `SPEEQ_LLM_BASE_URL`, `GROQ_API_KEY`, `GEMINI_API_KEY`...), never hard-coded in code.
  Verify existing names in `registry.ts` and reuse them.
- **Voice**: none, browser (Web Speech, no key) or server (the existing speech providers: Sarvam, Gemini STT);
  server voice adds only the key **names**. Languages are asked (default `en-IN`, plus Telugu and Hindi on request).
- **Layout wiring**: an anchored splice only for the documented shape (a `<body>` that contains `{children}`):
  insert the import and `<SpeeqAssistant />` before `</body>`. Any other shape: print the exact snippet (manual
  step). The splice is re-parsed, journaled and rolled back like every other change.
- **Non-interactive**: every prompt has a flag (`--provider`, `--voice none|browser|server`, `--languages`,
  `--no-ui`, `--yes`); with no flag and no TTY the defaults are mock, browser voice, UI on. `--json` unchanged.
- **Honest output**: the final summary lists exactly what was written and the next steps (`paste your key into
  .env.local`, `npm run dev`), and says "mock mode" when the provider is mock. No "verified" claims.
- The widget is accessible (labelled controls, focus management in dialogs, `aria-live` transcript), has no
  external dependency, no Tailwind requirement (scoped CSS in a `<style>` element), and handles: connection
  errors, mock badge, mic unsupported, confirmation dialog, UI-action approval, language switch, call mode.

## 4. Scope

Create: provider and voice registry entries and tests; `packages/integrate/src/ui-template.ts` (widget source),
`env.ts` (plan and apply env changes), layout splice helper; CLI prompts; docs; demo of the generated widget in a
fixture app test (generate, typecheck with `tsc`); `handoff/reports/021-zero-code-onboarding.md`.
Modify: `integrate/src/{plan,render,registry,apply,verify}.ts`, `cli/src/commands/init.ts`, `review.ts`, docs.
Do NOT touch: runtime packages' APIs, protocol, manifest schemas, compiler.

## 5. Contracts (sketch; finalise in the plan step)

```ts
interface ProviderEntry { id: "mock" | "groq" | "openrouter" | "gemini" | "openai-compatible"; label; needsKey;
  imports; expression; env: EnvVar[]; note }          // existing shape, new ids
interface VoiceEntry { id: "none" | "browser" | "server"; label; config: string[]; env: EnvVar[]; note }
planEnv(existing: string | undefined, names: EnvVar[], generated: { SPEEQ_SECRET: string }): { text: string; added: string[] }
renderAssistant(options: { voice: VoiceEntry["id"]; languages: string[]; mock: boolean }): string
spliceLayout(source: string, importPath: string): { ok: true; text: string } | { ok: false; snippet: string }
```

## 6. Tests required

- env: creates, appends only missing names, never changes or prints existing values, no duplicate lines,
  idempotent, keeps comments and CRLF, `.gitignore` updated once, `SPEEQ_SECRET` generated only when absent and 48 chars.
- providers: every entry has no hard-coded model id or key; env names are consistent with `reference/environment.md`.
- widget: generated file is owned, parses, **type-checks with `tsc` against the packed packages** in a clean app
  (extend `scripts/pack-cli-test.sh`), second init is a no-op, hand edit is never overwritten.
- layout splice: supported shape spliced and re-parsed; unsupported shapes (no `{children}`, fragment root,
  already wired) produce a manual snippet and no edit; rollback restores the layout byte for byte.
- CLI: interactive flow with scripted prompts, every flag, `--dry-run` writes nothing, `--ci` defaults.
- Playwright against a generated app in the fixture/real-app harness: the chat box appears and answers in mock mode.

## 7. Acceptance

`scripts/verify.sh`; `pack-all.sh` + `pack-cli-test.sh` (extended); a documented manual run in a clean app; report.

## 8. Finish

Commit on the branch, no attribution. Report in `handoff/reports/021-zero-code-onboarding.md`.

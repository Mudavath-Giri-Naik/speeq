# REPORT 021 — Zero-code onboarding

Status: DONE (built by the architect, not Codex)

Branch / last commit: task/021-zero-code-onboarding

Verify: see the final `scripts/verify.sh` run before merge; `pack-all.sh` + `pack-cli-test.sh` (now also checks the chat box, layout wiring and `.env.local`) pass; a generated app was also run for real (below).

## What I did

- Registry: providers `groq`, `openrouter` (OpenAI-compatible presets, key and model from env names only), menu order mock, groq, gemini, openrouter, custom. New voice entries `browser`, `cloud` (Groq and Gemini speech to text; the config only turns on when all four variables are set, so a fresh app still starts) and `none`.
- `ui-template.ts`: the chat box source (`components/speeq/assistant.tsx`, owned file). Text, mic, call mode, language switch, mock badge, errors, approval dialogs for confirmations and UI actions, accessible log and dialogs, scoped CSS, no dependency. All inserted values are JSON-escaped.
- `env.ts`: appends missing variable names with empty values and notes; never reads or prints existing values; keeps CRLF; generates only `SPEEQ_SECRET` (48 random characters) and only when absent; masks it in diffs. `.gitignore` gets `.env*.local` when missing.
- `layout.ts`: anchored splice for exactly one `<body>` that renders `{children}`; any other shape prints a snippet. Re-parsed before writing.
- Apply and rollback: new `append` change. Nothing is backed up for env files (they may hold keys); rollback removes exactly the appended block (length and hash) and skips the file if you changed it. Layout rolls back byte for byte.
- `.speeq/setup.json` remembers the choices (no keys), so `speeq upgrade` regenerates the same files.
- CLI: prompts for provider, voice, languages, chat box and env; flags `--provider --voice --languages --no-ui --no-env`; defaults without a terminal are mock, browser voice, chat box on; "Next steps" summary. Generated files are excluded from the manifest (the chat box contains a form).
- Docs: CLI guide, environment reference, quickstart.

## Evidence

- Real run: from the packed tarballs, in a clean Next.js app, `npx speeq init --ci` then `next dev`; a Chromium script opened the page, clicked "Ask Assistant", typed a message and got the mock reply, with a Mock mode badge and no browser errors.
- Tests: env (create, append, preserve values, CRLF, idempotent, masking, `.gitignore`), layout splice (supported shape, CRLF, directive, refusal of unsupported shapes), template (parses in every voice mode, escapes hostile names and languages, contains no env access), plan, diff never shows the secret, idempotent plan after a key is pasted, rollback keeps a filled-in key, CLI flags, defaults, dry run, unknown provider and voice exit 2, scripted prompts.

## Decisions I had to make (please review)

- The UI is generated code in the host app, not a package: principle 2 (packages stay headless) holds.
- `.env.local` creation is the only place speeq writes a value (`SPEEQ_SECRET`, random, local).
- Non-interactive `init` now writes the chat box and env files by default; `--no-ui` and `--no-env` opt out.
- Cloud voice is Groq plus Gemini speech to text only; Sarvam and self-hosted profiles remain manual.

## Risks / unsure about

- A layout that already has a `SpeeqProvider`, or no `{children}` in `<body>`, gets a manual snippet. The real-app validation (`validate:real`) was not re-run after this task; those apps would now also get a widget.
- Voice in real browsers beyond Chromium was not tested; the chat box falls back to text when speech input is unsupported.
- The mock reply text still tells you to "set SPEEQ_LLM_*" even though the new providers use `GROQ_API_KEY` etc.

## Open questions

- Should `speeq configure` be able to switch the provider and rewrite `speeq.config.ts`? Today it prints the expression to use, because that file is yours.

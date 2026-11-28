# speeq CLI

`speeq` scans a Next.js app, lets you approve what the assistant may use, and writes the glue code.
It never edits your own files, never approves anything for you, and every apply can be undone.

```bash
speeq init                 # scan, review, write files (interactive in a terminal)
speeq capabilities list    # what was found and its status
speeq capabilities enable "function:src/lib/cart.ts#addToCart" --access write --auth authenticated
speeq upgrade              # rescan after code changes, regenerate owned files
speeq rollback             # undo the last apply
speeq doctor               # environment and file checks (static)
speeq verify               # static checks plus a mock-runtime smoke and permission test
```

Install: `npm i speeq zod`, then `npx speeq init` in a Next.js App Router project (Node.js 22.12 or newer
for the command line tool; the SDK itself supports Node 20). `init --install` adds the two packages for
you.

## Chat box, voice and keys

`npx speeq init` also sets up the chat box, so you do not write any code. In a terminal it asks:

1. **Language model:** mock (no key, the default), Groq, Gemini, OpenRouter, or any OpenAI-compatible server such as Ollama.
2. **Voice:** browser voice (no key, Chrome and Edge), cloud speech-to-text (Groq and Gemini free tiers, better for Telugu and Hindi), or text only.
3. **Languages:** English, Telugu, Hindi.
4. **Add the chat box to your layout?** and **Write the needed variable names into `.env.local`?**

Then it writes:

- `components/speeq/assistant.tsx`: the chat box, with text, mic, call mode, language switch, mock badge, and approval dialogs for confirmations and page actions. It is generated into **your** app (speeq's own packages ship no UI). Delete its first line to take it over and restyle it.
- A one-line change to your root layout: an import and `<SpeeqAssistant />` before `</body>`. If your layout has another shape, speeq prints the exact snippet instead of guessing.
- `.env.local` and `.env.example` with the **names** of the variables you need and empty values. Unless you paste a key (below), speeq writes no key and reads no value. The one value it generates is `SPEEQ_SECRET` (random, made on your machine). `.gitignore` gets `.env*.local` if it does not already cover it.
- `.speeq/setup.json`, so `speeq upgrade` regenerates the same files.

`init` walks you through four steps, one screen each, with **← Back** on every choice:

1. **Language model:** Groq, Google Gemini, OpenRouter, any OpenAI-compatible server, or mock.
2. **Voice:** browser voice (free), cloud speech-to-text (Groq Whisper and Gemini free tiers), **Sarvam AI** (paid credits, best for Telugu, Hindi and more, and it speaks the replies), or text only.
3. **Languages.**
4. **Chat box** in your layout.

Then a review screen shows your choices. Pick any line to change it, or apply. Nothing is written until you apply.

As soon as you choose a provider that needs a key, speeq asks for it and **checks it at once**:

```text
◇  Step 1 of 4 · Language model
●  Your key goes only to api.groq.com. It is never printed and is saved only in .env.local.
◆  Your Groq key
│  ● Use the key already in .env   (GROQ_API_KEY, 56 characters)
│  ○ Paste a key now               (hidden as you type)
│  ○ Skip, I will add it later
│  ○ ← Back
◇  Groq key accepted · 4 chat models available
◇  Models: 4 working · 0 busy or limited · 0 unavailable
◇  Models ────────────────────────────────────╮
│  ✓ qwen/qwen3.8-27b   119 ms  ▰▰▰▰▰▰▰▰      │
│  ✓ allam-2-7b         186 ms  ▰▰▰▰▰▰▰▰      │
│  ! some-model         busy right now         │
│  ✗ old-model          no longer available    │
├──────────────────────────────────────────────╯
◆  Which model should speeq use?
```

What it checks for each service:

- **Groq, Gemini, OpenRouter, other servers:** the key is accepted, then each chat model gets one tiny message (a few tokens, at most 24 models) so you see which ones really work: ✓ working, `!` busy or rate limited (may work later), ✗ not available for your key. Speech, embedding, safety and image models are left out. OpenRouter tests only `:free` models, and a custom server asks first because the test may use paid quota.
- **Cloud speech-to-text:** both keys, then Groq's Whisper models and Gemini models are tested with half a second of silence, and the fastest working model for each is saved (`GROQ_STT_MODEL`, `GEMINI_STT_MODEL`).
- **Sarvam:** the key is checked without using credits, then you can have it speak a two-letter test (a few characters of credit). Sarvam is paid after the free credits, and speeq only uses it because you chose it.

The key goes **only to the provider's own host** (for example `api.groq.com`), in a request header. It is never printed, logged or put in a URL, and provider messages are scrubbed of it. It is saved only in `.env.local`, never in `.env.example` or `.speeq/setup.json`. If a key is already in `.env.local` or `.env`, speeq offers to use it and only reads it in memory to check it. If your `speeq.config.ts` still uses another provider or voice, speeq offers to switch it and keeps a copy in `.speeq/backups`.

If you would rather not paste a key into the terminal, choose **Skip** and fill `.env.local` by hand.

## Change anything later: `speeq setup`

`npx speeq setup` (alias `connect`) opens the control center: a status card, twelve sections with a badge each (`✓ set`, `! review`, `○ off`, `✕ broken`) and one recommended next step. See the [control center guide](../guides/control-center.md).

| #   | Section                          | What you change                                                           |
| --- | -------------------------------- | ------------------------------------------------------------------------- |
| 01  | Agent identity and personality   | Name, preset, purpose, personality, length, depth, name use, instructions |
| 02  | Business information             | Name, description, offerings, terms, support (prefilled from your code)   |
| 03  | Model provider and behavior      | Provider, model (keys checked at once), temperature, steps, history       |
| 04  | Voice and languages              | Browser, cloud, Sarvam or text only; languages                            |
| 05  | Authentication and identity      | Bind the detected sign-in; profile fields the agent may know              |
| 06  | Customer context and permissions | Approve discovered endpoints and the fields the agent may see             |
| 07  | Page and application context     | Page keys from `useSpeeqContext` the agent may see                        |
| 08  | Greetings and starter prompts    | Guest, member and returning greetings with a sample preview; starters     |
| 09  | Conversation memory              | Session, continue conversations, stated preferences; clearing             |
| 10  | Storage and retention            | Memory or MongoDB (hidden URI, connection check); retention               |
| 11  | Chat box appearance              | Add the generated chat box to your layout                                 |
| 12  | Verification and diagnostics     | Static checks and a mock-model smoke test                                 |

Nothing is written until **Save and finish**, which shows every change as a diff, writes it through the integration journal and tells you what to restart; `npx speeq rollback` undoes the save. **Exit without saving** (or Ctrl+C) writes nothing. Open one section directly with `npx speeq setup auth` or `npx speeq setup 06`. Without a terminal, `npx speeq setup --json` prints the state (sections, recommendation, discovered sign-in, data sources, business facts) and never any key or URI.

## Remove speeq completely: `speeq remove`

`npx speeq remove` (alias `uninstall`) shows everything speeq added and lets you choose what to take out. It touches only what speeq added:

| Item                                             | Default              | How it is found                                                    |
| ------------------------------------------------ | -------------------- | ------------------------------------------------------------------ |
| Generated files you have not edited              | removed              | They carry the `// speeq:generated` marker and match their hash.   |
| The chat box in your layout                      | removed              | The import and `<SpeeqAssistant />` are taken out, nothing else.   |
| `speeq.config.ts`                                | removed if unchanged | Kept when you have changed it, unless you choose it.               |
| The `.speeq` folder                              | removed              | Decisions, manifest, generated files, backups.                     |
| speeq's names in `.env.local` and `.env.example` | removed              | `SPEEQ_SECRET`, `SPEEQ_LLM_MODEL`, the speech model ids and so on. |
| Generated files you edited or took over          | kept                 | Listed separately; choose them to delete.                          |
| Provider keys (`GROQ_API_KEY`, ...)              | kept                 | Your app may use them; choose them to delete.                      |
| The `speeq` package                              | asked                | Uses your package manager. `zod` is left alone.                    |

Commit first so git can bring anything back. Without a terminal, `speeq remove --yes` removes the defaults, `--dry-run` only lists, and the package is never uninstalled.

Skip any part with flags: `--no-ui`, `--no-env`. Choose without prompts with `--provider groq|gemini|openrouter|openai-compatible|mock`, `--voice browser|cloud|sarvam|none`, and `--languages en-IN,te-IN,hi-IN`. Without a terminal the defaults are mock mode, browser voice and the chat box. `npx speeq rollback` undoes it: the layout is restored exactly, and an env file that you have already filled in is left alone.

Model ids change often, so speeq never guesses one: `connect` lists the models that work with your key right now. Without it, set `SPEEQ_LLM_MODEL` yourself (for Groq, pick one from console.groq.com/docs/models).

## What gets written

| File                                                     | Owner   | Rule                                                                                                                                                 |
| -------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.speeq/manifest.json`                                   | scanner | Rewritten on every scan. Facts and evidence only, no source text or data.                                                                            |
| `.speeq/decisions.json`                                  | you     | Changed only by `capabilities enable/disable` or the init review. Never regenerated.                                                                 |
| `.speeq/generated/tools.ts`, `routes.ts`                 | speeq   | First line `// speeq:generated sha256=...`. Overwritten only while the hash matches.                                                                 |
| `app/api/speeq/[[...speeq]]/route.ts`                    | speeq   | Same marker. `src/app` is used when your app uses `src/`.                                                                                            |
| `speeq.config.ts`                                        | you     | Created once. Only `setup` can change its provider or voice, after asking, with a copy kept. Its first save adds one import and `...agentSettings,`. |
| `.speeq/generated/agent.ts`, `identity.ts`, `context.ts` | speeq   | Written by `setup` from `.speeq/setup.json`. Server-only. Same marker rule.                                                                          |
| Root layout, anything else                               | you     | Never edited. `init` prints the snippet to paste.                                                                                                    |

Edit a generated file and speeq refuses to overwrite it (exit code 1). Delete its first line to take
ownership of it for good. Add `.speeq/backups/` to `.gitignore`.

Generated wrappers import **your** functions and wrap them with the approved input schema, so your own
permission checks still run. Endpoints are called through `bindEndpoint` (fixed method and path, same
origin from `SPEEQ_BASE_URL`, no redirects, size cap, timeout; cookies are forwarded only when the
decision says `forwardAuth`).

## Approvals

An approval stores the capability's fingerprint. If the code behind it changes meaning (input schema,
access, route parameters...), the capability becomes **stale**, is removed from the generated files on
the next run and stays off until you approve it again. Credentials handling is never executable;
`admin` and `financial` capabilities need `allowSensitive`. A function or endpoint that looks
non-public needs an `--auth` decision before it is wrapped.

## Options and exit codes

`--json` (one JSON document on stdout, nothing else), `--dry-run` (write nothing), `--diff`,
`--yes` / `--ci` (never prompt; also implied by `CI`, no terminal, or `--json`), `--app <dir>`,
`--cwd <dir>`, `--provider mock|openai-compatible|gemini`, `--install`.

| Code | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| 0    | Done                                                                  |
| 1    | Failure: hand-edited generated file, invalid decisions, apply failed  |
| 2    | Usage error, unknown capability, several apps and no `--app`          |
| 3    | Needs review: capabilities waiting for a decision, or stale approvals |
| 4    | Unsupported project, or a capability that can never be enabled        |

`--install` adds `speeq` and `zod` with your package manager at exact versions and `--ignore-scripts`.

## `doctor` and `verify`

Readiness is reported at three **separate** levels. A pass at one level says nothing about the others, and
speeq never claims "live provider verified" or "production ready".

| Level   | Command             | What it checks                                                                                                                                                                                                                                                                                          |
| ------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| static  | `doctor`, `verify`  | Generated files owned and unedited (S1), manifest fresh (S2), decisions valid (S3), generated files match your approvals (S4), config exports `speeq` (S5, S6), handler present (S7), env variable names set (S8), dependencies declared (S9), nothing waiting for review (S10). Node version (doctor). |
| runtime | `verify`            | Loads the generated tools and routes with a mock model. Write tools ask first and do not run before approval or after a denial. Auth guards block anonymous users and wrong roles. Audit routes return 404 without `authorize`. **Your code is not run:** host imports are replaced by stubs.           |
| host    | `verify --run-host` | Runs your own `typecheck` script (or `tsc --noEmit`). This is the only level that executes commands from your project.                                                                                                                                                                                  |

**Personalisation (0.12).** Static: settings from `speeq setup` are wired into `speeq.config.ts` (P1),
the bound sign-in file and export still exist (P2), cross-session memory has a signed-in user (P3),
the conversation store fits the memory mode, and MongoDB has its URI and verified persistence (P4),
approved customer data sources are generated (P5). Runtime, with your settings, a mock model and a test
user instead of your sign-in: guest, sign-in, sign-out, account and tenant switch and a forged browser
identity behave (RP1), greetings use only real values and never an unexposed name (RP2), and memory
continues only the owner's conversation and clears (RP3). `speeq verify --live-store` runs the RP1 and
RP3 round trip in your MongoDB, in temporary `speeq_verify_*` collections that it drops afterwards (L1,
host level). `speeq doctor` shows the static ones with what to do, for example "MongoDB is configured
but persistence has not been verified".

A generated file you edited (marker still present) fails S1 and its runtime tests are skipped, never
run. Environment variable names are read from the process and `.env*` files; values are never stored or
printed. Exit codes follow the table above: 1 if any check fails, 3 if nothing failed but capabilities
still wait for a decision. With `--json` the document has `readiness` (`pass`, `fail` or `not-run` per
level) and `checks`.

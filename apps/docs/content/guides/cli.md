---

title: Set up with one command
description: Use npx speeq init to scan your Next.js app, approve what the assistant may use, and write the glue code.
---

# Set up with one command

**What you will learn:** how `npx speeq init` finds what your app can do, how you approve it, and how to check and undo the result.

If you already have a Next.js App Router app, you do not have to write the tools and routes by hand. The `speeq` command **reads** your code (it never runs it), lists what the assistant could use, and writes the wiring only for what **you** approve.

> **Note** The command needs Node.js 22.12 or newer. The SDK itself still runs on Node.js 20.

## The short version

```bash
npm i speeq zod
npx speeq init
```

`init` does these steps, and prints a line only for work it really did:

1. **Scan.** It finds pages, API route handlers, server actions, their Zod input schemas, forms and filters.
2. **Review.** In a terminal it asks what to enable, and separately which forms the assistant may fill as a draft. Nothing is approved for you.
3. **Write.** It creates the handler route, `speeq.config.ts`, and files under `.speeq/`.

Running `init` a second time changes nothing unless your code or your decisions changed.

## Chat box, voice and keys, all from the terminal

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

## How the assistant behaves

- **It starts the conversation** with a short greeting and buttons for a few of your pages, then follows the whole conversation: it uses what you already said and does not ask twice.
- **It talks like a person**: short, relaxed sentences, no stock phrases, and in Telugu or Hindi it uses everyday spoken words instead of a word-for-word translation.
- **It knows the page you are on** (the path and title, never the query string) and the pages speeq found in your app.
- **Opening a page is quick**: the model says one short line and changes the page in the same reply, so there is no second wait.
- **The chat box is black and white** (it follows the light or dark setting of the visitor's device), with CSS-only motion that turns off for people who ask for less motion. It adds no packages to your app. It is a file in your app, so you can restyle it: delete its first line to take it over.
- **Speed depends mostly on the model.** Free tiers have small limits, and a limit shows up as "the assistant is busy". Groq answered in about half a second when I measured; a free Gemini key hit its limit after a few messages. `npx speeq setup` shows which of your models answer.

## After you update speeq

The chat box and the other generated files are written into your app, so updating the package does not change them. After `pnpm add speeq@latest` run `npx speeq upgrade` (or `npx speeq setup`, which also refreshes an outdated chat box) to get the new version of them. Files you edited are never overwritten.

## Change anything later: `speeq setup`

`npx speeq setup` (alias `connect`) opens the same review screen on your current setup. Change the model, the voice, the languages or the chat box, paste a new key, or switch from Groq to Gemini; each key is checked as you give it. When you apply, it saves the keys, updates `speeq.config.ts` (after asking), and regenerates the chat box. It needs a terminal.

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

## Commands

| Command                           | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `speeq init`                      | Scan, review, write files.                                                                    |
| `speeq setup`                     | Change the model, voice, languages and keys step by step. Keys are checked as you paste them. |
| `speeq remove`                    | Take speeq out of the project: only what it added, with a review first.                       |
| `speeq capabilities list`         | Show what was found and its status.                                                           |
| `speeq capabilities enable <id>`  | Approve one thing. Add `--access read\|write` and `--auth public\|authenticated` when needed. |
| `speeq capabilities disable <id>` | Turn one thing off.                                                                           |
| `speeq upgrade`                   | Scan again after code changes and regenerate the files speeq owns.                            |
| `speeq rollback`                  | Undo the last apply.                                                                          |
| `speeq doctor`                    | Check your environment and files (static).                                                    |
| `speeq verify`                    | Static checks plus a mock-model test of confirmations and permissions.                        |

Useful options: `--json` (one JSON document, nothing else), `--dry-run` (write nothing), `--diff`, `--yes` or `--ci` (never ask questions), `--app <dir>`, `--provider mock|groq|gemini|openrouter|openai-compatible`, `--voice browser|cloud|sarvam|none`, `--languages`, `--no-ui`, `--no-env`, `--install`.

## What gets written

| File                                     | Who owns it | Rule                                                                                         |
| ---------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `.speeq/manifest.json`                   | the scanner | Rewritten on every scan. Facts only: no source text, no data.                                |
| `.speeq/decisions.json`                  | you         | Changed only by your choices. Never regenerated.                                             |
| `.speeq/generated/tools.ts`, `routes.ts` | speeq       | First line `// speeq:generated sha256=...`. Overwritten only while unedited.                 |
| `app/api/speeq/[[...speeq]]/route.ts`    | speeq       | Same marker. Uses `src/app` if your app uses `src/`.                                         |
| `speeq.config.ts`                        | you         | Created once. Only `setup` can change its provider or voice, after asking, with a copy kept. |
| Your layout and everything else          | you         | Never edited. `init` prints the snippet to paste.                                            |

Add `.speeq/backups/` to `.gitignore`. If you edit a generated file, speeq refuses to overwrite it. Delete its first line to take the file over for good.

Generated wrappers **import your own functions**, so your own permission checks still run. API routes are called through a fixed method and path on your own origin: no redirects, a size limit, a time limit, and cookies only when you say so.

## Approvals

An approval remembers a fingerprint of the thing you approved. If the code behind it changes meaning (its input, its access, its route parameters), it becomes **stale**, stops running, and waits for you to approve it again.

- Anything that handles credentials is never enabled.
- Admin and financial things need an explicit `allowSensitive`.
- A function or route that looks private needs an `--auth` choice before it is wrapped.
- A write needs confirmation by default, like every write in speeq.

## Check it: doctor and verify

Readiness has three **separate** levels. A pass at one level says nothing about the others.

| Level   | Command             | What it checks                                                                                                                                                 |
| ------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| static  | `doctor`, `verify`  | Files unedited, manifest fresh, decisions valid, config and handler present, env names set, dependencies, nothing waiting.                                     |
| runtime | `verify`            | Loads the generated tools with a mock model. Writes ask first. Wrong roles are blocked. Audit routes return 404 without `authorize`. **Your code is not run.** |
| host    | `verify --run-host` | Runs your own `typecheck` script. This is the only step that runs a command from your project.                                                                 |

speeq never says "live provider verified" or "production ready". A level that did not run says `not-run`.

## Exit codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| 0    | Done.                                                               |
| 1    | Failure: an edited generated file, invalid decisions, apply failed. |
| 2    | Usage error, unknown capability, or several apps and no `--app`.    |
| 3    | Needs review: things waiting for a decision, or stale approvals.    |
| 4    | Unsupported project, or something that can never be enabled.        |

## What it cannot do yet

- Next.js **App Router** only. The Pages Router gets guidance, not an automatic handler.
- Patterns the scanner cannot prove (dynamic route exports, schemas built at runtime) are **reported as unsupported**, not guessed. See the supported patterns in the repository docs (`docs/reference/compiler-supported-patterns.md`).
- MongoDB is not detected automatically.

## See also

[Quickstart](/docs/quickstart) · [Let it do things (tools)](/docs/guides/tools) · [Asking before changes](/docs/concepts/confirmations)

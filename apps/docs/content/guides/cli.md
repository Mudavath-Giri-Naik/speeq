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
- `.env.local` and `.env.example` with the **names** of the variables you need and empty values. speeq never writes your keys and never reads the values you add. The one value it generates is `SPEEQ_SECRET` (random, made on your machine). `.gitignore` gets `.env*.local` if it does not already cover it.
- `.speeq/setup.json`, so `speeq upgrade` regenerates the same files.

Then you only paste the keys:

```text
Next steps
  1. Open .env.local, paste a value for: GROQ_API_KEY, SPEEQ_LLM_MODEL
  2. Save it
  3. Run npm run dev and open your app: the chat box is bottom-right
```

Skip any part with flags: `--no-ui`, `--no-env`. Choose without prompts with `--provider groq|gemini|openrouter|openai-compatible|mock`, `--voice browser|cloud|none`, and `--languages en-IN,te-IN,hi-IN`. Without a terminal the defaults are mock mode, browser voice and the chat box. `npx speeq rollback` undoes it: the layout is restored exactly, and an env file that you have already filled in is left alone.

Model ids change often, so speeq never writes one: you set `SPEEQ_LLM_MODEL` yourself (for Groq, pick one from console.groq.com/docs/models).

## Commands

| Command                           | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `speeq init`                      | Scan, review, write files.                                                                    |
| `speeq capabilities list`         | Show what was found and its status.                                                           |
| `speeq capabilities enable <id>`  | Approve one thing. Add `--access read\|write` and `--auth public\|authenticated` when needed. |
| `speeq capabilities disable <id>` | Turn one thing off.                                                                           |
| `speeq upgrade`                   | Scan again after code changes and regenerate the files speeq owns.                            |
| `speeq rollback`                  | Undo the last apply.                                                                          |
| `speeq doctor`                    | Check your environment and files (static).                                                    |
| `speeq verify`                    | Static checks plus a mock-model test of confirmations and permissions.                        |

Useful options: `--json` (one JSON document, nothing else), `--dry-run` (write nothing), `--diff`, `--yes` or `--ci` (never ask questions), `--app <dir>`, `--provider mock|groq|gemini|openrouter|openai-compatible`, `--voice`, `--languages`, `--no-ui`, `--no-env`, `--install`.

## What gets written

| File                                     | Who owns it | Rule                                                                         |
| ---------------------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `.speeq/manifest.json`                   | the scanner | Rewritten on every scan. Facts only: no source text, no data.                |
| `.speeq/decisions.json`                  | you         | Changed only by your choices. Never regenerated.                             |
| `.speeq/generated/tools.ts`, `routes.ts` | speeq       | First line `// speeq:generated sha256=...`. Overwritten only while unedited. |
| `app/api/speeq/[[...speeq]]/route.ts`    | speeq       | Same marker. Uses `src/app` if your app uses `src/`.                         |
| `speeq.config.ts`                        | you         | Created once, never overwritten.                                             |
| Your layout and everything else          | you         | Never edited. `init` prints the snippet to paste.                            |

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

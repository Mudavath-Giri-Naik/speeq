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

At the end of `init` it offers to take your key right there, or you can do it any time with `npx speeq connect`:

```text
? Paste your Groq API key (hidden, Enter to skip)  ****************
Checking the key...
Testing 12 models (the first 25 of 40). Each gets one tiny message.
  ✓ llama-3.3-70b-versatile   310 ms
  ✓ llama-3.1-8b-instant      180 ms
  ✗ some-old-model            The model does not exist
? Which model should speeq use?
Saved GROQ_API_KEY, SPEEQ_LLM_MODEL in .env.local.
```

What `connect` does, and what it does not:

- The key is typed hidden and sent **only to the provider's own host** (for example `api.groq.com`), in a request header. It is never printed, logged or put in a URL, and provider error messages are scrubbed of it.
- It asks the provider whether the key is accepted, lists the chat models, and sends each one a tiny message (a few tokens) to see which really work. Models that are not chat models (speech, embeddings, safety, image) are left out. OpenRouter tests only `:free` models, and for a custom OpenAI-compatible server it asks first because the test may use paid quota.
- You pick from the models that answered, fastest first. The key and the model are written to `.env.local` only: never to `.env.example`, and never to the setup file. An existing value is replaced only if you say yes.
- If your `speeq.config.ts` still uses another provider (for example Gemini when you chose Groq), it offers to switch it, and keeps a copy in `.speeq/backups`.
- `speeq rollback` does not remove a key you saved. Delete the line yourself to remove it.
- It needs a terminal. In CI or with `--json` it exits with a usage error and calls nothing.

If you would rather not paste a key into the terminal, skip it and fill `.env.local` by hand.

Skip any part with flags: `--no-ui`, `--no-env`. Choose without prompts with `--provider groq|gemini|openrouter|openai-compatible|mock`, `--voice browser|cloud|none`, and `--languages en-IN,te-IN,hi-IN`. Without a terminal the defaults are mock mode, browser voice and the chat box. `npx speeq rollback` undoes it: the layout is restored exactly, and an env file that you have already filled in is left alone.

Model ids change often, so speeq never guesses one: `connect` lists the models that work with your key right now. Without it, set `SPEEQ_LLM_MODEL` yourself (for Groq, pick one from console.groq.com/docs/models).

## What gets written

| File                                     | Owner   | Rule                                                                                  |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `.speeq/manifest.json`                   | scanner | Rewritten on every scan. Facts and evidence only, no source text or data.             |
| `.speeq/decisions.json`                  | you     | Changed only by `capabilities enable/disable` or the init review. Never regenerated.  |
| `.speeq/generated/tools.ts`, `routes.ts` | speeq   | First line `// speeq:generated sha256=...`. Overwritten only while the hash matches.  |
| `app/api/speeq/[[...speeq]]/route.ts`    | speeq   | Same marker. `src/app` is used when your app uses `src/`.                             |
| `speeq.config.ts`                        | you     | Created once. Only `connect` can change its provider, after asking, with a copy kept. |
| Root layout, anything else               | you     | Never edited. `init` prints the snippet to paste.                                     |

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

A generated file you edited (marker still present) fails S1 and its runtime tests are skipped, never
run. Environment variable names are read from the process and `.env*` files; values are never stored or
printed. Exit codes follow the table above: 1 if any check fails, 3 if nothing failed but capabilities
still wait for a decision. With `--json` the document has `readiness` (`pass`, `fail` or `not-run` per
level) and `checks`.

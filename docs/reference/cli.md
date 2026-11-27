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

## What gets written

| File                                     | Owner   | Rule                                                                                 |
| ---------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `.speeq/manifest.json`                   | scanner | Rewritten on every scan. Facts and evidence only, no source text or data.            |
| `.speeq/decisions.json`                  | you     | Changed only by `capabilities enable/disable` or the init review. Never regenerated. |
| `.speeq/generated/tools.ts`, `routes.ts` | speeq   | First line `// speeq:generated sha256=...`. Overwritten only while the hash matches. |
| `app/api/speeq/[[...speeq]]/route.ts`    | speeq   | Same marker. `src/app` is used when your app uses `src/`.                            |
| `speeq.config.ts`                        | you     | Created once, never overwritten.                                                     |
| Root layout, anything else               | you     | Never edited. `init` prints the snippet to paste.                                    |

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

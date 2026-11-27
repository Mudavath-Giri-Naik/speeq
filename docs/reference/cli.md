# speeq CLI

`speeq` scans a Next.js app, lets you approve what the assistant may use, and writes the glue code.
It never edits your own files, never approves anything for you, and every apply can be undone.

```bash
speeq init                 # scan, review, write files (interactive in a terminal)
speeq capabilities list    # what was found and its status
speeq capabilities enable "function:src/lib/cart.ts#addToCart" --access write --auth authenticated
speeq upgrade              # rescan after code changes, regenerate owned files
speeq rollback             # undo the last apply
```

## What gets written

| File                                    | Owner     | Rule                                                                                |
| --------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| `.speeq/manifest.json`                  | scanner   | Rewritten on every scan. Facts and evidence only, no source text or data.           |
| `.speeq/decisions.json`                 | you       | Changed only by `capabilities enable/disable` or the init review. Never regenerated. |
| `.speeq/generated/tools.ts`, `routes.ts` | speeq     | First line `// speeq:generated sha256=...`. Overwritten only while the hash matches. |
| `app/api/speeq/[[...speeq]]/route.ts`   | speeq     | Same marker. `src/app` is used when your app uses `src/`.                            |
| `speeq.config.ts`                       | you       | Created once, never overwritten.                                                     |
| Root layout, anything else              | you       | Never edited. `init` prints the snippet to paste.                                    |

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

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| 0    | Done                                                                 |
| 1    | Failure: hand-edited generated file, invalid decisions, apply failed |
| 2    | Usage error, unknown capability, several apps and no `--app`         |
| 3    | Needs review: capabilities waiting for a decision, or stale approvals |
| 4    | Unsupported project, or a capability that can never be enabled       |

`--install` adds `speeq` and `zod` with your package manager at exact versions and `--ignore-scripts`.
`verify` and `doctor` arrive in the next release.

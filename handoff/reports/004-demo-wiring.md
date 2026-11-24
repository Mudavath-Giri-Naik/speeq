# REPORT 004 — Demo app and speeq wiring

Status: PARTIAL

Branch / last implementation commit: `task/004-demo-wiring` / `5a496a2`

Verify: lint ✅ · typecheck ✅ · tests 219 passed / 0 failed · build ✅

Files: 34 created, 2 modified, 0 deleted

- `apps/demo/**`
- `.env.example`
- `pnpm-lock.yaml`
- `handoff/reports/004-demo-wiring.md`

## What I did

- Added eight server-rendered pages backed by six subjects and 60 original practice questions.
- Wired the Vidya handler, route manifest, catalogue tools, knowledge search, confirmed bookmarks, and admin-only audit access.
- Implemented signed demo login and provider selection for Groq, Gemini, and the English, Telugu, and Hindi mock. Added optional MongoDB conversation storage with an in-memory default.
- Installed from the frozen lockfile in a clean copy. With no env files or provider keys, all eight pages and `POST /api/speeq/session` returned 200 in mock mode. An unknown subject returned 404.
- Built and started the production demo. `GET /`, `/practice?subject=physics`, `/questions/12`, `/pricing`, and `POST /api/speeq/session` each returned 200. The session used mock mode with the signing secret in the root `.env` and the provider override in the app-local `.env.local`.

## Verify output

```text
✅ lint       6s
✅ typecheck  28s
✅ test       17s
   tests: 219 passed, 0 failed
✅ build      47s
All checks passed (full log: .verify.log)
```

## Auth coverage for decision 6

- A01–A04 cover the domain-separated HMAC, base64url format, seven-day expiry, invalid inputs, and roles from the fixed account list.
- A05–A06 cover request and Next cookie parsing, trimmed env settings, the dev secret fallback, and production failure with no secret.
- A07, A09–A10 cover password defaults and overrides, production admin disablement, the 500 ms delay, and admin sign-in. The implementation uses SHA-256 and `timingSafeEqual` for the digest comparison.
- A08 and A10 cover student-only sign-in, cookie attributes in development and production, and the fixed redirect to `/` despite `next` values. A11 covers sign-out and cookie deletion.

## Deviations from the brief

- The root `pnpm dev` exits because its filters include the absent `@speeq/platform` package. The direct `pnpm --filter @speeq/demo dev` command works from a clean copy. The root launcher is outside task scope.
- The pre-existing `handoff/INDEX.md` edit stayed staged and outside the commits, per the resume instructions. Local credential values in the root `.env.example` stayed unstaged.

## Decisions I had to make (please review)

- Added a demo `predev` script to build workspace dependencies when the demo is launched directly. Used ports 3106 and 3107 for HTTP smoke checks because port 3000 was occupied.

## Risks / unsure about

- The demo tests use mock inference and an isolated memory store. Live Groq, Gemini, and MongoDB connectivity was outside the smoke checks.

## Open questions

- Resolve the root development launcher when the platform package lands or in a task that includes the root `package.json`.

# TASK 008 — Platform dashboard: admin login, metrics pages, external stats, seed

Branch: task/008-platform-dashboard (already created from `main`; it contains this brief. Check it out, do not create another).

## 1. Read first

- `AGENTS.md`, `PLAN.md` §1 (platform tree) and §3 decisions 9–11.
- `handoff/tasks/007-platform-ingest.md` and `handoff/reports/007-platform-ingest.md` (what exists: schema, DB client, ingest rules, cron).
- `apps/platform/db/schema.ts`, `db/client.ts`, `lib/env.ts`, `lib/projects.ts`, `lib/ingest/validate.ts` (the counter invariants seeded data must satisfy), `lib/cron/cleanup.ts`, `next.config.ts`, `proxy.ts`.
- `apps/demo/lib/demo-auth.ts` and `apps/demo/app/login/*` (the demo's cookie + server-action login; the platform's is stricter, see §3.1).
- `docs/reference/telemetry.md` (what each metric means).

## 2. Goal

`apps/platform` gets a password-protected admin dashboard with five pages (Overview, Installs,
Projects, Features, Reliability), a login page, npm/GitHub stats cards with a database cache, and
`seed` / `seed:clear` scripts that fill the dashboard with realistic fake data. No client-side
JavaScript is needed: pages are server components, forms use server actions, charts are inline SVG.

## 3. Decisions already made (do NOT change or re-decide)

### 3.1 Admin authentication (security-critical; implement exactly)

- **Config:** `ADMIN_PASSWORD` and `SESSION_SECRET` (read through `lib/env.ts#setting`).
  - `NODE_ENV !== "production"`: if `ADMIN_PASSWORD` is unset use `"admin"`; if `SESSION_SECRET` is unset use a random 32-byte secret generated once per process (sessions end on restart). Log one `console.warn` line saying dev defaults are in use (no values in it).
  - `NODE_ENV === "production"`: login is **disabled** unless `ADMIN_PASSWORD` is non-empty and `SESSION_SECRET` is at least 32 characters. Disabled means the login page shows "Admin login is not configured" and the login action returns without creating any session; dashboard pages redirect to `/login`. Never fall back to defaults in production.
- **Password check:** SHA-256 both the submitted and the configured value, then `crypto.timingSafeEqual` on the digests. Trim nothing from the submitted password except a single trailing newline. Max accepted submitted length 256 chars (longer = rejected as invalid without hashing).
- **Session token:** a JWT created with the `jose` library (add `jose` as an exact-pinned dependency): `HS256`, `iss: "speeq-platform"`, `aud: "dashboard"`, `sub: "admin"`, `iat`, `exp = iat + 8 h`, random `jti`. Verification must pass `{ algorithms: ["HS256"], issuer, audience, clockTolerance: 5 }` and additionally require `sub === "admin"`. Any failure (bad signature, `alg: none`, wrong alg/issuer/audience, expired, malformed, wrong secret) → treated as signed out, never an exception to the caller.
- **Cookie:** name `__Host-speeq_admin` in production and `speeq_admin` in development (the `__Host-` prefix needs `Secure`, `Path=/`, no `Domain`). Attributes: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Max-Age=28800`, `Secure` in production. Logout clears it (same name and attributes, `Max-Age=0`).
- **Login throttle (DB-backed, atomic, reuse `ingest_throttle`):** charge **before** checking the password, in 15-minute UTC-aligned windows, with buckets `login:<clientHash>` (limit **8** attempts per window) and `login:global` (limit **100** per window), using the same atomic upsert-increment as `lib/ingest/throttle.ts` (generalise that helper; do not duplicate it; keep ingest behaviour and tests intact). Over the limit → no password check, response is the generic "Too many attempts, try again later" with HTTP 429 semantics (a server action cannot set status: render the message and do **not** verify the password). Throttle storage failure → fail **closed** (no login).
- **Client hash:** `HMAC-SHA256(sessionSecretOrDevSecret, clientIp)` hex, first 32 chars. `clientIp` comes from `x-forwarded-for` (first entry, trimmed) **only if** `TRUST_PROXY_HEADERS=1`, else from `x-real-ip` **only if** `TRUST_PROXY_HEADERS=1`, else the constant `"unknown"`. Never store or log the raw IP. Document `TRUST_PROXY_HEADERS` in `apps/platform/README.md` (set it on Vercel and behind trusted proxies only).
- **Timing:** every login attempt (success or failure) takes at least 300 ms (pad with a timer; do not sleep on throttled attempts that skip the check).
- **CSRF / redirects:** login and logout are Next server actions (built-in Origin check). After a successful login redirect to the fixed path `/dashboard`; after logout to `/login`. There is **no** `next`/`returnTo` parameter anywhere.
- **Every dashboard page and server action authorises itself.** Provide `requireAdmin(): Promise<AdminSession>` (reads the cookie, verifies, otherwise `redirect("/login")`). `AdminSession` is a branded type that only `requireAdmin` can produce, and **every function in `lib/metrics/*`, `lib/external-stats.ts` consumers on the dashboard, and the project create/revoke actions takes an `AdminSession` argument**, so unauthenticated use does not type-check. Do not rely on `proxy.ts` or a shared layout for authorisation. Do not extend `proxy.ts`.
- **Headers** (in `next.config.ts` `headers()` for `/:path*` **except** `/api/v1/ingest`, which keeps its current behaviour): `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `x-robots-tag: noindex, nofollow`, and `cache-control: no-store` for `/dashboard/:path*` and `/login`.
- **Errors are generic:** wrong password and unknown state show the same "Incorrect password" text; nothing reveals whether auth is configured beyond the explicit disabled message above; no stack traces in pages.

### 3.2 Routes and pages (all server components, dynamic, `runtime = "nodejs"`)

- `/` → redirect to `/dashboard`. `/login` (form, server action). `/dashboard` (Overview), `/dashboard/installs`, `/dashboard/projects`, `/dashboard/features`, `/dashboard/reliability`. A shared `app/dashboard/layout.tsx` provides navigation, the range selector and logout (it may call `requireAdmin` too, but each page must call it as well).
- **Range selector:** search param `range` ∈ `7d | 30d | 90d`, default `30d`, validated with a Zod enum (invalid → default). Rendered as links, not JS. All times are UTC; "day" = UTC day.
- **Overview:** stat cards (active installs = distinct instances with a rollup in range; sessions; turns; voice share % of turns; navigations; tool calls builtin/custom; knowledge searches; confirmation approval rate = approved ÷ (approved + rejected), "n/a" when 0 denominator; errors per 100 turns); a daily time series of turns and of sessions (SVG bars/line); new installs per day (by `first_seen`); top languages (sum of `languages`); latency p50 and p95 (see §3.4); the npm/GitHub cards from §3.5.
- **Installs:** table of instances sorted by `last_seen desc`, 25 per page with `page` search param (integer ≥ 1, validated), columns: short id (first 8 chars of `instance_id`, never more), project name (or "unattributed"), SDK version, runtime name + version, framework, first seen, last seen; distributions (bar lists) for SDK version, runtime, framework; "active in last 7 days" count.
- **Projects:** list (name, public key shown in full because `pk_…` keys are public by design, created, revoked flag, instances count, turns in range, last activity); a create form (name 1–80 chars, trimmed) and a revoke button (server actions, `requireAdmin` inside the action, input validated with Zod, generic failure message). Revoked projects stay listed, greyed out.
- **Features:** among instances that reported `sdk.init` features: share enabled for navigation, tools, knowledge, audit, confirmations; distributions of `store` and `llm` kinds; average `languageCount`; plus usage mix: voice vs text turns, builtin vs custom tool calls. Show "n instances reported features" (denominator) and exclude instances without features.
- **Reliability:** errors by code (range), errors per 100 turns, daily error series, total and first-token latency histograms as bar charts with bucket labels `≤250 ms … ≤16 s, >16 s`, and p50/p95 for both.
- Empty states: every card/chart/table has a friendly empty state ("No data yet. Run `pnpm --filter @speeq/platform seed`"). Division by zero must never render `NaN` or `Infinity`.

### 3.3 Metrics code

- `lib/metrics/{overview,installs,projects,features,reliability,range}.ts`, each exporting plain async functions `(db, session: AdminSession, params) => Promise<Result>` with explicit result types. **Aggregate in SQL** (`sum`, `count`, `date_trunc('day', …)`, `jsonb_each_text`, `jsonb_array_elements_text … with ordinality`); never load all rollup rows into memory. Use Drizzle's `sql` template with bound parameters only; no string concatenation of user input.
- Daily series are zero-filled for every day in the range (UTC), in ascending order.

### 3.4 Percentiles from histograms

Given bucket counts `c[0..7]` and upper bounds `LATENCY_BUCKETS_MS` (from `@speeq/core`): the pth percentile is the upper bound of the first bucket whose cumulative count reaches `ceil(p × total)`; if that is the overflow bucket return `{ overflow: true }` (rendered "> 16 s"); total 0 → `null` (rendered "n/a"). Pure function `percentileFromHistogram(counts, p)` in `lib/metrics/histogram.ts`, unit tested.

### 3.5 External stats

- `lib/external-stats.ts`: `getNpmDownloads(db, session)` for `["@speeq/core","@speeq/server","@speeq/client","@speeq/react"]` using `https://api.npmjs.org/downloads/point/last-week/<encodeURIComponent(name)>` (404 → `{ published: false }`), and `getGithubStats(db, session)` using `https://api.github.com/repos/<GITHUB_REPO>` (stars, forks only). `GITHUB_REPO` must match `^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$`; otherwise the GitHub card shows "not configured" and **no request is made**. Hosts are fixed constants (no user-controlled URLs, no redirects: `redirect: "error"`).
- Requests: `GET`, `accept: application/json`, `user-agent: speeq-platform`, no credentials, timeout 3 s (`AbortSignal.timeout`), response body read with a 100 KB cap, parsed with Zod (only the fields used).
- **Cache in the DB:** new table `external_stats` (`key text primary key`, `payload jsonb not null`, `ok boolean not null`, `fetched_at timestamptz not null`) with a new committed drizzle migration (`0001_…`; PGlite applies it automatically). TTL: 6 h for successful entries, 15 min for failed ones. On expiry refetch inline; if the refetch fails serve the stale payload (flagged `stale: true`) and record the failure; if there is no payload at all show "unavailable". A failing external API must never fail or noticeably slow the page beyond the 3 s timeout, and never throws.

### 3.6 Seed scripts

- `scripts/seed.ts` and `scripts/seed-clear.ts`; package scripts `seed` and `seed:clear` (`tsx …`). Both use the same DB selection as the app (`DATABASE_URL`, else PGlite). **Refuse to run when `NODE_ENV === "production"`.**
- Deterministic: seeded PRNG (e.g. mulberry32 with a fixed seed), 2 projects named `[seed] Demo Academy` and `[seed] Voice Notes`, ~40 instances with ids `5eed0000-0000-4000-8000-<12 hex>`, 90 days of daily rollups with plausible growth, weekday/weekend pattern, a mix of languages (en-IN, te-IN, hi-IN, others), 3 SDK versions, node/edge/bun runtimes, a spread of feature flags and store/llm kinds, and a few error spikes. **Every seeded row must satisfy the ingest invariants** (voice + text = turns, language sum ≤ turns, histogram sums ≤ turns, 8 histogram slots, period ≤ 7 days). `seed` is idempotent (clears its own previous rows first).
- `seed:clear` deletes **only** seeded data: instances whose id starts with `5eed0000-` (rollups and errors cascade) and projects whose name starts with `[seed] `. It must not touch anything else.

### 3.7 UI

- **No Tailwind, no UI library, no chart library, no icon package.** Plain CSS in `app/globals.css` with CSS variables, a light/dark theme following `prefers-color-scheme`, system fonts, responsive down to 360 px.
- Hand-vendored primitives in `components/ui/{card,button,table,badge}.tsx` (small, typed, no dependencies; a tiny `cn` helper in `lib/cn.ts`). Charts in `components/charts/{bar-chart,line-chart,distribution}.tsx` as inline SVG/CSS with `role="img"` + a text summary, or a real `<table>` alternative for the data; colours from CSS variables with sufficient contrast in both themes. Colour is never the only carrier of meaning.
- Accessibility floor: landmarks (`header`, `nav`, `main`), one `h1` per page, labelled form controls, visible focus rings, `aria-current="page"` on the active nav link.
- Do not add any `"use client"` component.

## 4. Scope

Create: `apps/platform/app/{login,dashboard}/**`, `apps/platform/app/dashboard/layout.tsx`, `components/ui/*`, `components/charts/*`, `lib/auth/*` (token, password, cookie, throttle wrapper, `requireAdmin`), `lib/metrics/*`, `lib/external-stats.ts`, `lib/cn.ts`, `scripts/seed.ts`, `scripts/seed-clear.ts`, `db/migrations/0001_*` (+ meta), `apps/platform/README.md`, `apps/platform/test/*.test.ts`, `handoff/reports/008-platform-dashboard.md`.

Modify: `apps/platform/{package.json,next.config.ts,app/page.tsx,app/layout.tsx,app/globals.css (create),db/schema.ts}`, `lib/ingest/throttle.ts` (only to share the atomic helper; behaviour and its tests must not change), `lib/env.ts`, `pnpm-lock.yaml`, `.gitignore` if needed.

Do NOT touch: `packages/**`, `apps/demo/**`, `.env.example`, `handoff/INDEX.md`, the ingest validation/persist/handler/read-body logic, `proxy.ts`.

## 5. Requirements

1. All of §3.1 behaves exactly as written (config modes, token verification, cookie attributes, throttle windows and limits, constant delay, fixed redirects, per-page authorisation, headers).
2. Unauthenticated requests to any `/dashboard/**` page get a redirect to `/login`; server actions refuse without a valid session.
3. All five pages render real numbers from SQL aggregates and show correct empty states with an empty database and with seeded data.
4. Percentiles, daily zero-fill, shares and rates match hand-computed expectations from small fixtures.
5. External stats are cached, bounded, validated and never break a page.
6. Seed produces invariant-respecting data and `seed:clear` removes exactly the seeded rows.
7. `next build` succeeds with no env; the ingest endpoint and its tests are unchanged and green.

## 6. Contracts

```ts
// lib/auth/session.ts
export type AdminSession = { readonly __brand: "AdminSession"; readonly expiresAt: Date };
export function requireAdmin(): Promise<AdminSession>; // redirects to /login when not signed in
export function readAdminSession(
  cookieValue: string | undefined,
  now?: Date,
): Promise<AdminSession | null>;
export function createAdminToken(now?: Date): Promise<string>; // uses the resolved secret
export function authStatus(): {
  enabled: boolean;
  mode: "development-defaults" | "configured" | "disabled";
};

// lib/auth/login.ts
export function attemptLogin(
  input: { password: string; clientIp: string; now?: Date },
  deps: { db: Db },
): Promise<
  | { ok: true; token: string }
  | { ok: false; reason: "invalid" | "throttled" | "disabled" | "unavailable" }
>;

// lib/metrics/histogram.ts
export function percentileFromHistogram(
  counts: number[],
  p: number,
): number | { overflow: true } | null;

// lib/metrics/range.ts
export const RANGES = ["7d", "30d", "90d"] as const;
export function parseRange(value: unknown): (typeof RANGES)[number];
export function rangeWindow(
  range: (typeof RANGES)[number],
  now: Date,
): { from: Date; to: Date; days: string[] };

// lib/external-stats.ts
export type Stat<T> =
  | { status: "ok"; value: T; stale: boolean }
  | { status: "unavailable" | "not-configured" };
```

Metric functions all have the shape `(db: Db, session: AdminSession, params) => Promise<…>`.

## 7. Tests required (`apps/platform/test/*.test.ts`, PGlite in memory; mock `fetch` for external stats)

Auth (`attemptLogin`, token, cookie helpers; do not need Next request context):

- Correct password → token that `readAdminSession` accepts; wrong password → `invalid`; password > 256 chars → `invalid` without hashing; production with missing password or secret < 32 chars → `disabled` and no token; development defaults accepted.
- Tokens rejected: tampered payload, wrong secret, `alg: none` token, expired token, wrong `iss`, wrong `aud`, `sub` ≠ admin, garbage string, empty/undefined; none throw.
- Throttle: 9th attempt from the same client in a window → `throttled` and the password is **not** evaluated (assert via a spy or by supplying the correct password and still expecting `throttled`); a different client hash is unaffected; global 101st → `throttled`; 20 parallel attempts for one client yield at most 8 evaluated; DB failure → `unavailable`; the throttle window rolls over after 15 minutes (inject `now`); no raw IP appears in any stored `bucket`.
- Timing floor: a failed attempt takes ≥ 300 ms (fake timers or measured with tolerance), a throttled one does not wait.
- Cookie helper: attributes in production vs development exactly as §3.1; logout cookie has `Max-Age=0`.
- `requireAdmin` redirects without a cookie (mock `next/headers` and `next/navigation`).
- Project create/revoke server actions reject without a session and validate input (empty name, 81 chars, non-uuid id).
- The ingest throttle tests from task 007 still pass unchanged.

Metrics (fixtures inserted directly with known numbers):

- `percentileFromHistogram`: empty → null; all in first bucket; boundary at exactly `ceil(p×total)`; overflow result; p50/p95 on a multi-bucket example.
- `rangeWindow` returns the right number of UTC days; `parseRange` falls back to `30d`.
- Overview totals, voice share, approval rate (and the 0-denominator case), errors per 100 turns with 0 turns (no NaN), zero-filled daily series, top languages summing across rows.
- Installs pagination bounds (`page` 0, negative, huge, non-numeric → safe default), short id length 8, distributions, unattributed label.
- Features shares exclude instances without features; denominators correct.
- Reliability error totals by code, histogram bars sum to the totals.
- Every metrics function is called with a session argument (type-level: add a `// @ts-expect-error` test calling one without a session).

External stats:

- npm 200 → ok; npm 404 → `published: false`; GitHub 200 → stars/forks; invalid `GITHUB_REPO` → `not-configured` and `fetch` not called; fetch rejects/times out → stale value if cached else `unavailable`; fresh cache means no fetch; failed entries retry only after 15 min; oversized body rejected; response with unexpected shape rejected; redirects not followed.

Seed:

- Seeded rows satisfy every ingest invariant (reuse the validation helpers or re-assert them); running `seed` twice yields the same row counts; `seed:clear` removes only seeded data (insert one non-seed instance and project first and assert they survive); both refuse `NODE_ENV=production`.

Smoke (report it, not a unit test): `pnpm --filter @speeq/platform dev` with no env: `/dashboard` redirects to `/login`; logging in with the dev default works; after `seed`, all five pages return 200 and show numbers; `seed:clear` returns them to empty states.

## 8. Acceptance

- `scripts/verify.sh` passes with no overrides (`pnpm lint:fix` for formatting).
- `next build` for the platform succeeds with no env vars.
- No new dependency except `jose` (exact-pinned). No `"use client"`.
- `git diff --stat` touches only §4 files. `.env.example` not staged. No secrets anywhere.
- Report includes the smoke results above and screenshots are **not** required.

## 9. Finish

Commit on the branch (Conventional Commits, no attribution lines of any kind, no Co-Authored-By).
Write `handoff/reports/008-platform-dashboard.md` from `handoff/REPORT_TEMPLATE.md` and print it.
Do not merge to main. Do not push. Do not edit `handoff/INDEX.md`. If any rule in §3.1 seems wrong
or impossible, stop and say so in the report; do not weaken it.

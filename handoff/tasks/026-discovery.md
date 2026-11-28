# TASK 026 — Discovery: auth bindings, customer data sources, business facts

Branch: task/026-discovery (from main at 334a756)

## 1. Read first

Release plan §2 and §4, ADR-0022 (identity), ADR-0023 (context providers), ADR-0024 §7 (smart defaults with
evidence), `compiler/src/nextjs/auth.ts`, `compiler/src/project/integrations.ts`, `server/src/endpoint.ts`,
`server/src/context/define.ts`, `integrate/src/render.ts`.

## 2. Goal

The compiler can tell setup which sign-in system the app uses (with evidence and an honest level), which GET
endpoints could describe the signed-in customer, and what the business is. The integration engine can render
a server-only `resolveUser` and endpoint-backed context sources from approved choices.

## 3. Decisions

- Discovery is a separate entry point `discoverPersonalization({ root, appDir?, manifest })`, not part of
  `scan`: the cache contract says a warm scan parses only middleware files.
- Auth levels: `implementation-detected` only when the server entry point is found (Auth.js `auth` export,
  `authOptions` outside route files, Supabase `createServerClient` wrapper, `betterAuth` instance, Clerk with
  `clerkMiddleware`). A package alone is `provider-detected`. Kinde and custom helpers `requires-review`.
  Firebase `unsupported`. No binding is ever generated without an entry point.
- Generated `resolveUser`: Supabase uses `getUser()` and throws on `AuthRetryableFetchError` (AUTH_UNAVAILABLE,
  not anonymous); Clerk `orgId` is the tenant; Auth.js id falls back to email (internal only).
- Data sources: GET endpoints matched by path words, never `/api/auth|speeq|webhooks|cron|health`. Bound
  sources call the endpoint through `bindEndpoint({ forwardAuth: true })` with `z.unknown()` output and the
  approved `expose` list. `contextSpec` refuses sensitive fields (also nested), unknown fields, parameterised
  endpoints, and endpoints without auth-helper evidence unless `authReviewed`.
- Business facts: layout metadata > package.json description/homepage > README; package name only as a hint;
  `needsDescription` when nothing reliable.

## 7. Tests required

Each provider detected and bound; v4 authOptions in a route file needs review; package-only never binds;
Firebase unsupported; custom helper reviewed not bound; static site finds nothing. Data sources: categories,
fields, sensitive flags, auth and scope evidence, bracket params require binding, skipped paths. Business
facts precedence. Generated identity modules for every provider and the context module type-check.

## 8. Acceptance

`scripts/verify.sh` passes; cache test unchanged.

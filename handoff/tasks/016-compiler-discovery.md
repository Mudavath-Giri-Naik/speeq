# TASK 016 — The compiler: repo and Next.js discovery, schemas, forms, filters, manifest, reconcile, incremental scan

Branch: task/016-compiler-discovery (create it from latest main, **after 015 is merged**)

This is the whole compiler in one task (it replaces the earlier plan of three briefs). It is large,
so it is organised in **milestones M1 to M7**. Commit after each milestone with `feat(compiler): M<n> …`
so progress is reviewable. If you run out of room, stop at a clean milestone boundary, set the report
status to PARTIAL and list exactly which milestones and requirements remain. Never weaken a test or a
fixture to finish.

## 1. Read first

- `docs/maintainers/master-plan.md`, ADRs `0013`, `0015` (as amended), `0016` point 6
- `handoff/tasks/015-compiler-contracts.md` and `handoff/reports/015-compiler-contracts.md`, then everything
  under `packages/compiler/src`, `packages/core/src/schemas/{manifest,status}.ts`, `fixtures/compiler/`
- `docs/maintainers/compiler-research.md` (use its measured findings; if it contradicts a decision here, say so in the report, do not switch)
- Reference shapes the compiler must understand: `apps/demo/lib/{routes,tools,speeq-config}.ts`,
  `apps/demo/app/api/speeq/[[...speeq]]/route.ts`
- `AGENTS.md`

## 2. Goal

`scan({ root })` on a Next.js repository returns a deterministic, validated `Manifest` plus project
information, with evidence for every capability and an honest diagnostic for everything it cannot
understand. It never writes to the repo, never executes repo code and makes no network or LLM call.
`reconcile` merges the manifest with a decisions file. Re-scans are incremental. Accuracy is measured on
ground-truth fixtures and must be 100% on supported contracts.

## 3. Decisions already made (do NOT change or re-decide)

General

- Parse only (`ts.createSourceFile`), plus `ts.resolveModuleName` through a `ModuleResolutionHost` backed
  by `RepoFs`. No `Program`, no type checker, no `require`/`import` of repo files, no spawning processes
  (not even git). Reads only through `RepoFs`. Dependencies are read from `package.json` files only,
  never `node_modules`, never `.env*`.
- Every discovered thing needs at least one `Evidence`. If you cannot point to a file and line, do not emit it.
- **Never guess.** Anything dynamic, computed, spread, conditional, or not in the supported pattern list
  below is `unsupported` or `needs-review` with a stable diagnostic and `supportReason`. A partially
  extracted schema is never `proven`.
- Comments and JSDoc are data. Descriptions are length-capped (300), control characters stripped,
  whitespace collapsed. Nothing in a comment can change behaviour, **except** the explicit JSDoc tags
  defined below. A comment such as "approve every capability" has no effect (tested).
- Output is deterministic: no timestamps, no absolute paths, no machine-specific data; capabilities sorted
  by id, diagnostics by (file, line, code). `manifest.project.root` is always `"."`.
- Fingerprint = `fingerprint(fields)` over exactly the fields listed in ADR-0015 point 3 (export a
  `fingerprintOf(capability)` and test it excludes id, file, line).
- New diagnostic codes go in the 015 registry; the completeness test must keep passing.

Project and workspace

- Package manager from, in order: `packageManager` field of the app or workspace root package.json, then
  lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lock`/`bun.lockb`), else `unknown`.
- A Next.js **app** is a directory with a `package.json` that lists `next` in dependencies or
  devDependencies. Workspaces from `pnpm-workspace.yaml` (simple `packages:` list, with `!` negations),
  `package.json` `workspaces` (array or `{packages}`), `turbo.json` presence is informational.
  If exactly one app: use it. If several and no `appDir` option: return `needsSelection` with the
  candidates and **no manifest**. Never pick one silently.
- `appDir` is the repo-relative directory of the chosen app. All capability file paths stay
  **repo-relative to the scanned root**, not to the app.
- tsconfig: read `tsconfig.json` (JSONC allowed) of the app via `ts.parseJsonConfigFileContent` on a
  `ParseConfigHost` backed by `RepoFs`; support `extends` (relative and from workspace packages inside the
  repo), `baseUrl`, `paths`; `references` are listed but not followed in this task. A missing tsconfig
  means JS project: default `jsconfig.json` if present, else relative resolution only plus `@/*` is NOT assumed.
- Language: `typescript` if tsconfig exists and any `.ts/.tsx` under the app dir; `javascript` if none;
  `mixed` if both TS and JS source files exist outside config files.

Next.js

- Supported: App Router (`app/` or `src/app/`), Pages Router (`pages/` or `src/pages/`), both in one app.
  Next 13 to 16 conventions. `middleware.(ts|js)` and `proxy.(ts|js)` (the renamed file) are both read for
  auth evidence.
- App Router files: `page` (`.tsx .jsx .ts .js`) makes a route; `route` makes an endpoint (methods =
  exported `GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS`, as `export function`, `export async function`,
  `export const X =`, `export { local as X }`, `export { X } from`; a non-method export is ignored).
  Ignored (no capability, no diagnostic): `layout`, `template`, `loading`, `error`, `global-error`,
  `not-found`, `default`, `opengraph-image`, `icon`, `sitemap`, `robots`, `manifest`.
  Path rules: route group `(name)` segments are removed; folders starting `_` are private (skipped);
  `[x]` dynamic, `[...x]` catch-all, `[[...x]]` optional catch-all; `@slot` parallel routes are skipped
  with diagnostic `SQ0140`; intercepting folders `(.)`, `(..)`, `(...)`, `(..)(..)` skipped with `SQ0141`.
  `pathPattern` (speeq form): `[x]` becomes `:x`, `[...x]` becomes `:x*`, `[[...x]]` becomes `:x*?`.
  (Catch-all patterns are `needs-review` because core's `resolveNavigation` only fills `:name`.)
- Pages Router: files under `pages/` except `_app`, `_document`, `_error`, `404`, `500`; `pages/api/**` are
  endpoints (methods unknown from the filename: read `req.method` comparisons only in the form
  `req.method === "<LITERAL>"` or `switch (req.method) { case "<LITERAL>": }`; otherwise `methods` is an empty
  array (all methods are never assumed), `support` is `needs-review` and `SQ0150` is reported).
  Page title/description only from a literal `export const metadata`
  (App Router) of the form `{ title: "…", description: "…" }` or `title: { default|absolute: "…" }`;
  `generateMetadata` and non-literal values are ignored (title falls back to the last path segment,
  title-cased; `/` becomes "Home").
- Routes: `access` is always `read` (navigation reads). `support` is `proven` for static routes and for
  dynamic routes with `[x]`; `needs-review` for catch-all and optional catch-all.
  Dynamic routes have `queryParams: []` unless a filter-set links to them.
- Endpoints: `access` is **always `unknown`** in this task (never inferred from the method or the name).
  `support` is `proven` only when input evidence (below) is complete for every discovered method
  or the handler provably reads no input (see below); otherwise `needs-review`.
- Sensitivity (deterministic, by lowercased path segments, applied to routes, endpoints, functions by
  file path segments and export name, forms by route and field names). First match wins:
  `credentials`: segment in `login, signin, sign-in, signup, sign-up, register, auth, oauth, callback,
  logout, signout, password, reset-password, forgot-password, verify-email, verify, otp, 2fa, mfa, session`;
  `admin`: `admin, administrator, internal, backoffice, cron, webhook, webhooks, debug, _next`;
  `financial`: `checkout, payment, payments, billing, invoice, invoices, subscription, subscriptions, refund, payout, wallet`;
  `personal`: `account, profile, settings, me, orders, order, address, addresses`; else `none`.
  `unknown` is used only when the capability's identity is non-deterministic.
- Auth observation: `present` when (a) a `middleware`/`proxy` file has a literal `config.matcher` (string
  or array of strings) whose pattern matches the route path, using Next's `path-to-regexp` semantics for
  the simple subset `:param`, `:param*`, `:param+`, `:param?`, `(.*)`, plain prefixes, and a negative-lookahead
  matcher is **not interpreted**: it yields `unknown` and `SQ0160`; or (b) the file that defines the
  route/handler/function contains a call to one of these identifiers or member names: `auth`, `getServerSession`,
  `getSession`, `getToken`, `currentUser`, `clerkClient`, `getUser`, `requireUser`, `requireAuth`,
  `withAuth`, `auth.protect`, `supabase.auth.getUser`, `getKindeServerSession`. `none-found` when neither;
  `unknown` when a matcher could not be interpreted. Evidence only; the note says "observed, not verified".
- Integrations (from package.json dependencies only, exact table in section 6) and existing speeq
  (`speeq` or `@speeq/*` dependency, `speeq.config.(ts|js|mjs)`, `.speeq/manifest.json`, `.speeq/decisions.json`,
  existing `defineTool(`/`defineRoute(` calls, counted and reported as info `SQ0170`; they are **not**
  turned into capabilities).

Schemas (Zod)

- Recognised import forms of Zod: `import { z } from "zod"`, `import * as z from "zod"`,
  `import z from "zod"`, `from "zod/v4"`, and named imports of builders. `zod/mini` is not supported (`SQ0210`).
- Recognised builders (everything else makes the **whole schema** `needs-review` with `SQ0211`, naming the
  first unsupported call): `z.object`, `z.strictObject`, `z.string`, `z.number`, `z.boolean`, `z.enum`,
  `z.literal`, `z.array`, `z.union` (of recognised members), `z.coerce.string|number|boolean`;
  chained `.optional()`, `.nullable()`, `.nullish()`, `.default(<literal>)`, `.describe("<literal>")`,
  `.min`, `.max`, `.length`, `.gt`, `.gte`, `.lt`, `.lte`, `.int`, `.positive`, `.nonnegative`, `.email`,
  `.url`, `.uuid`, `.regex(<regex literal>)`, `.trim`, `.toLowerCase`, `.toUpperCase` (the last three are
  recorded as no-ops), `.extend({...})`, `.pick({...})`, `.omit({...})` with literal key objects, `.partial()`
  with no argument, and `z.enum(CONST_ARRAY_OR_OBJECT)` where the constant is an `as const` array literal
  or `Object.values/keys` is **not** supported. A schema referenced by identifier is followed through
  same-file declarations and resolved imports (named, default, namespace, re-export, barrel, `export * from`),
  up to depth 8, cycle safe. `.refine`, `.superRefine`, `.transform`, `.pipe`, `.lazy`, `.preprocess`,
  `.brand`, `.catch`, `.record`, `.tuple`, `.map`, `.set`, `.instanceof`, `.custom`, `.intersection`,
  `.discriminatedUnion` are unsupported in this task.
- Output is `JsonSchemaLite` (section 6 in 015). Object schemas get `additionalProperties: false` for
  `strictObject` only. Property order follows source order. A field is `required` unless `.optional()`,
  `.nullish()` or `.default()`.
- Sensitive field names: split the name into lowercase words (camelCase, snake_case, kebab-case) and match
  **whole words or the joined form**, never substrings: `password`, `passwd`, `pwd`, `secret`, `token`,
  `apikey` (also `api`+`key`), `cvv`, `cvc`, `otp`, `pin`, `cardnumber` (also `card`+`number`), `ccnumber`,
  `iban`, `accountnumber`, `ssn`, `aadhaar`, `pannumber`. So `pinCode` matches (word `pin`) but `pinterestUrl`
  and `panel` do not. A function or endpoint whose input schema contains a sensitive field gets sensitivity
  `credentials` (therefore blocked). Forms list such
  fields with `sensitive: true`.

Functions and server actions

- Candidates are **only**: (a) exported functions of a file whose first statement is the directive
  `"use server"`, (b) exported functions carrying the JSDoc tag `@speeq` (any of `@speeq`, `@speeq read`,
  `@speeq write`) in the leading JSDoc of the declaration. Plain exported helpers are never candidates.
  `@speeq-ignore` removes a candidate. Inline `"use server"` inside a function body is not importable:
  diagnostic `SQ0220`, no capability. Existing `defineTool` use is reported (`SQ0170`), not wrapped.
- Access: the tag word (`read` or `write`) when present, else `unknown`. This is the developer's own
  declaration in their code, but it still needs an approval decision.
- Input schema evidence for the **first parameter** only, `object` argument style only: (1) type annotation
  `z.infer<typeof S>` or `z.input<typeof S>` (S resolved as above), or (2) the first statement(s) of the body
  contain `S.parse(<param>)` or `S.safeParse(<param>)` (also `await S.parseAsync(...)`). `validatesAtRuntime`
  is true only for (2). No parameter: input absent, `proven` if tagged, no schema needed.
  `FormData` parameter (type annotation `FormData`, or two parameters where the second is `FormData`/the
  first is a previous state) is a **form action**: `needs-review`, `supportReason: "formdata-action"`,
  diagnostic `SQ0221`. More than one parameter otherwise: `needs-review`, `SQ0222`.
  Type annotations that are not Zod-derived never become schemas.
- Capability name defaults come from the export name; the id is `function:<file>#<export>`.

Endpoint input evidence (route handlers)

- Body: `S.parse|safeParse|parseAsync(await <req>.json())` where `<req>` is the first parameter or the
  result of destructuring, or a previous `const body = await <req>.json()` followed by `S.parse(body)`.
- Query: `S.parse|safeParse(Object.fromEntries(<req>.nextUrl.searchParams))`, or
  `...(new URL(<req>.url).searchParams)`, or `<req>.nextUrl.searchParams.get("<literal>")` calls (each
  literal becomes a string parameter without schema and the endpoint is `needs-review`).
- A handler that reads neither body nor query, nor `params`, nor `req.formData()` is recorded with
  `input: { source: "none" }` and `proven`. Anything else (`req.formData()`, `req.text()`, dynamic access) is `needs-review` with `SQ0230`.

Forms

- Sources: native `<form>` JSX elements in `.tsx/.jsx` files under the app dir (pages, components);
  React Hook Form: `useForm({ resolver: zodResolver(S) })` or `useForm<z.infer<typeof S>>()` combined with
  `register("<literal>")` / `<Controller name="<literal>">` in the same file.
- Native fields: `<input|select|textarea name="<string literal>">`; `type` literal default `text`;
  `required` boolean attribute; checkbox, radio, number, email, date, etc. recorded as the literal `type`.
  Any non-literal `name` marks the form `needs-review` (`SQ0240`) and that field is omitted.
- `actionRef`: when `<form action={ident}>` and `ident` resolves (same file or import) to a function
  capability id, link it. Otherwise no link.
- A form is `access: "write"` if it has an `action` or `onSubmit`, otherwise `unknown`. `sensitivity` is
  `credentials` if any field is sensitive (password type, autocomplete `cc-*`, sensitive name list) or the
  route path matches credentials; else the route-derived sensitivity.
- Form id key: `<file>#<id-or-name literal>`, else `<file>#form<N>` (N = 1-based order among forms in that
  file). `runtimeBinding` is always `"none"`.

Filters and search

- `filter-set` capabilities only from structural evidence: (1) a page default export in `page.*` that calls
  `S.parse|safeParse(<searchParams>)` where `searchParams` is the page's props member (awaited or not),
  S a recognised Zod object: parameters from the schema; (2) `useSearchParams()` results used via
  `.get("<literal>")` in a component rendered by exactly the same file as the page (same file only, no
  cross-file inference): parameters without schema, `needs-review`; (3) none other. Names are never
  derived from labels, variable names or function names. A filter-set links to its route
  (`routeId`) and the route's `queryParams` are filled from it. Pagination and sort are just parameters.

Reconcile and incremental scan

- `reconcile` is pure. It never writes. Moves are detected for `function` only (ADR-0015 point 2).
- Incremental scan: `scan` takes an optional previous `ScanCache` and returns a new one. The caller persists
  it (the compiler is read-only). Cache key per file: sha256 of content plus `ANALYZER_VERSION`.
  The cache records, per file, the extraction result and the list of files it resolved imports to, so a
  changed file invalidates every file that imports it, directly or transitively. A cache from another
  `ANALYZER_VERSION` or with a different `appDir` is ignored. The result with a cache must equal the
  result without one (tested on every fixture).

## 3b. Fix required in the 015 foundation (found in review, do this first as commit `fix(compiler): F1`)

`fs/deny.ts` ignores `dist`, `build`, `out` and `coverage` at **every nesting level**, so real routes such as
`app/build/page.tsx`, `app/coverage/page.tsx`, `app/out/page.tsx` or `pages/dist/...` are silently dropped:
a false negative with no diagnostic. Required behaviour: `node_modules`, `.next`, `.turbo`, `.vercel`,
`.pnpm-store` stay ignored at every level; `dist`, `build`, `out`, `coverage` are ignored **only when the
directory containing them also contains a `package.json`** (a project root), and are otherwise normal
directories. Apply it in both `listFiles` and direct reads. Add a fixture `fixtures/compiler/build-named-routes`
(routes `/build`, `/out`, `/coverage` under `app/`, plus a real `dist/` and `build/` next to the app's
`package.json` that must stay ignored, plus `packages/lib/dist/x.ts` that must stay ignored) and tests.
Modify `packages/compiler/src/fs/{deny,repo-fs}.ts` and their tests for this fix only.

## 4. Scope

Create (under `packages/compiler/src` unless stated; split files by the ~200-line guide):
`project/{package-manager,workspace,tsconfig,language,integrations,existing-speeq}.ts`,
`ts/{parse,resolve,exports}.ts`, `nextjs/{index,app-router,pages-router,metadata,matcher,auth,sensitivity}.ts`,
`schema/{zod,json-schema,sensitive-names}.ts`, `extract/{endpoints,functions,forms,filters}.ts`,
`manifest/{build,fingerprint-of,related}.ts`, `reconcile.ts`, `diff.ts`, `cache.ts`, `scan.ts`,
`jsdoc.ts`, tests under `packages/compiler/test/**`, many fixtures under `fixtures/compiler/**` (section 7),
`scripts/gen-large-fixture.ts` inside `packages/compiler` (generates a large synthetic app in a temp
dir, not committed), `docs/maintainers/compiler-benchmark.md`, `docs/reference/compiler-supported-patterns.md`
(user-facing list of supported and unsupported patterns, generated by hand from this brief, under 150 lines).
Modify: `packages/compiler/src/index.ts` (exports), `adapter.ts` only if the 015 contract must grow (record why),
`diagnostics.ts` (new codes), `eval/*` (the `eval` script now runs the real `scan`), `handoff/INDEX.md`.
Do NOT touch: anything outside `packages/compiler`, `fixtures/compiler`, the two docs above, `handoff/`.
`@speeq/core` manifest schemas may change **only** for a defect found while implementing; list every such
change in the report and keep it backward compatible.

## 5. Requirements

1. `scan(options)` per section 6. Validates its own output with `parseManifest` before returning
   (a failure is a bug and throws `ToolError SQ0010`).
2. Milestones, each with its fixtures and tests: **M1** project, workspace, tsconfig, language,
   integrations, existing speeq. **M2** Next.js routes (App and Pages), metadata, matcher, auth, sensitivity,
   framework adapter registered. **M3** TS resolution, export maps, Zod extraction to JSON Schema.
   **M4** endpoints, functions and server actions. **M5** forms and filters. **M6** manifest build,
   fingerprints, related links, `reconcile`, `diffManifests`. **M7** incremental cache, performance
   measurement, docs, eval over all fixtures.
3. Ground truth first: **commit every `expected.json` and fixture source before writing the detector that
   it tests** (separate commit, message `test(compiler): fixtures for M<n>`), derived from the rules in this
   brief, not from the output of your implementation. If a rule is ambiguous, decide, write the decision into
   the fixture comment and the report.
4. `pnpm --filter @speeq/compiler eval` runs all fixtures and prints the per-kind precision, recall, false
   positives and negatives, unsupported-diagnostic correctness and evidence correctness. It must exit 0 with
   100% on every supported fixture and must still fail for a deliberately broken scorer input (tested).
5. Hostile and resource tests per section 7. A scan of any fixture must make zero writes (assert by running
   the scan against a read-only copy of the fixture, or by wrapping fs and recording calls).
6. Performance: `gen-large-fixture.ts` creates an app with 1 000 pages, 300 route handlers, 100 actions,
   200 schemas in a temp dir. Record in `compiler-benchmark.md`, with the machine described and the
   commands used: full scan time, peak RSS, incremental scan after touching one page, and after touching
   one widely imported schema file. Do not assert timings in tests; assert only parse counts from
   `ScanStats` (`filesParsed`, `filesFromCache`).
7. `docs/reference/compiler-supported-patterns.md` lists every supported pattern and every unsupported
   pattern with its `SQ` code, in plain language.
8. `ScanStats` and the CLI-facing summary: `inventory` counts by kind and by support, counts of diagnostics
   by severity. No timing field inside `Manifest` (timing lives only in `ScanResult.stats`).

## 6. Contracts

```ts
export const ANALYZER_VERSION: string; // bump on any extraction logic change

export interface ScanOptions {
  root: string;                          // directory to scan (repo root or any dir inside it)
  appDir?: string;                       // repo-relative app directory, required when several apps exist
  cache?: ScanCache;
  signal?: AbortSignal;
  extraIgnore?: string[];
  limits?: { maxFileBytes?: number; maxFiles?: number; maxImportDepth?: number; deadlineMs?: number };
}

export interface AppCandidate { dir: string; name?: string; nextVersion?: string; evidence: Evidence[] }

export interface ProjectInfo {
  packageManager: "npm" | "pnpm" | "yarn" | "bun" | "unknown";
  workspace: { kind: "none" | "pnpm" | "npm" | "yarn" | "turbo"; root: string; apps: AppCandidate[] };
  app?: { dir: string; nextVersion?: string; routers: ("app" | "pages")[];
          appRouterDir?: string; pagesDir?: string; srcDir: boolean };
  language: "typescript" | "javascript" | "mixed";
  tsconfig?: { path: string; baseUrl?: string; aliases: { pattern: string; targets: string[] }[] };
  typescriptVersionInRepo?: string;      // from package.json range, informational
}

export type IntegrationCategory =
  "auth" | "database" | "payment" | "llm" | "agent-framework" | "speech" | "storage" | "analytics" | "speeq";
export interface DetectedIntegration {
  id: string;                            // e.g. "nextauth", "supabase", "stripe"
  categories: IntegrationCategory[];
  package: string; versionRange: string;
  evidence: Evidence[];                  // the package.json line
}

export interface ExistingSpeeq {
  installed: boolean; configFile?: string; manifestPresent: boolean; decisionsPresent: boolean;
  existingTools: number; existingRoutes: number;
}

export interface ScanStats { filesListed: number; filesParsed: number; filesFromCache: number;
  importsResolved: number; durationMs: number; peakRssBytes?: number }

export interface ScanCache { analyzerVersion: string; appDir: string; files: Record<string, CachedFile> }
export interface CachedFile { sha256: string; imports: string[]; extraction: unknown } // opaque outside the compiler

export type ScanResult =
  | { status: "ok"; manifest: Manifest; project: ProjectInfo; integrations: DetectedIntegration[];
      existingSpeeq: ExistingSpeeq; cache: ScanCache; stats: ScanStats }
  | { status: "needs-selection"; candidates: AppCandidate[]; project: ProjectInfo }
  | { status: "unsupported"; reason: string; diagnostics: Diagnostic[]; project: ProjectInfo };
// "unsupported": no Next.js app found, or Next.js older than 13 (manifest never fabricated)
export function scan(options: ScanOptions): Promise<ScanResult>;

export function fingerprintOf(capability: Omit<Capability, "fingerprint" | "id" | "source" | "evidence">): string;

export interface Reconciliation {
  entries: { id: string; decision?: CapabilityDecision; status: CapabilityStatus }[]; // one per manifest capability, sorted by id
  newCapabilities: string[];             // no decision yet
  stale: string[];                       // approved, fingerprint changed
  orphaned: string[];                    // decision with no capability, not explained by a move
  moved: { from: string; to: string }[]; // ADR-0015 point 2, function kind only
  invalidDecisions: { id: string; reason: string }[]; // e.g. approved without fingerprint, access missing for unknown
}
export function reconcile(
  manifest: Manifest, decisions: DecisionsFile | undefined,
  context?: (id: string) => StatusContext,           // default { binding: "none", verification: "unverified" }
): Reconciliation;

export interface ManifestDiff { added: string[]; removed: string[]; changed: string[]; unchanged: number }
export function diffManifests(before: Manifest | undefined, after: Manifest): ManifestDiff;

export const INTEGRATION_TABLE: readonly { package: string | RegExp; id: string; categories: IntegrationCategory[] }[];
```

Integration table (exact, match on package name from `dependencies`, `devDependencies`, `peerDependencies`):
`next-auth` nextauth [auth]; `@auth/core` authjs [auth]; `@clerk/nextjs` clerk [auth]; `firebase`, `firebase-admin`
firebase [auth, database, storage]; `better-auth` better-auth [auth]; `@supabase/ssr`, `@supabase/auth-helpers-nextjs`
supabase-auth [auth]; `@supabase/supabase-js` supabase [database, auth, storage]; `@kinde-oss/kinde-auth-nextjs` kinde [auth];
`mongodb`, `mongoose` mongodb [database]; `@prisma/client`, `prisma` prisma [database]; `drizzle-orm` drizzle [database];
`pg`, `postgres`, `@neondatabase/serverless` postgres [database]; `@libsql/client` libsql [database];
`stripe`, `@stripe/stripe-js` stripe [payment]; `razorpay` razorpay [payment]; `@paypal/react-paypal-js` paypal [payment];
`openai` openai [llm]; `@anthropic-ai/sdk` anthropic [llm]; `@google/generative-ai`, `@google/genai` google-genai [llm];
`groq-sdk` groq [llm]; `ollama` ollama [llm]; `ai`, `@ai-sdk/*` vercel-ai-sdk [llm, agent-framework];
`langchain`, `@langchain/*` langchain [agent-framework, llm]; `@langchain/langgraph` langgraph [agent-framework];
`@google/adk` google-adk [agent-framework]; `@openai/agents` openai-agents [agent-framework];
`@aws-sdk/client-s3`, `@vercel/blob`, `@uploadthing/*`, `cloudinary` storage-service [storage];
`posthog-js`, `posthog-node` posthog [analytics]; `@vercel/analytics` vercel-analytics [analytics];
`mixpanel-browser` mixpanel [analytics]; `@segment/analytics-next` segment [analytics]; `speeq`, `@speeq/*` speeq [speeq].

Diagnostic codes to add (message and severity are yours, one line each): `SQ0101` multiple apps, `SQ0102`
no Next.js app, `SQ0103` Next older than 13, `SQ0104` tsconfig unreadable, `SQ0140` parallel route skipped,
`SQ0141` intercepting route skipped, `SQ0150` Pages API methods unknown, `SQ0160` matcher not interpretable,
`SQ0170` existing speeq tools or routes found, `SQ0210` zod/mini unsupported, `SQ0211` unsupported zod
builder, `SQ0212` schema not resolvable, `SQ0213` import depth or cycle, `SQ0220` inline server action,
`SQ0221` formdata action, `SQ0222` multi-parameter function, `SQ0230` endpoint input not understood,
`SQ0240` form field name not literal, `SQ0250` filter source not understood, `SQ0260` file not parseable,
`SQ0270` dynamic export pattern. Reuse 015 codes for fs problems.

## 7. Tests and fixtures required

Fixtures (each small, committed, with a hand-written `expected.json`; add traps listed). Names are
`fixtures/compiler/<name>`:

1. `next-app-minimal`, `next-pages-minimal`, `hostile` (from 015, now with real expectations; hostile expects
   `forbidden` to contain every id that the planted comment or `.env` content tries to cause).
2. `next-app-src`: `src/app`, `@/*` alias, TS.
3. `js-jsx-app`: `.js/.jsx`, `jsconfig.json`; `language: javascript`.
4. `mixed-app`: both TS and JS sources.
5. `monorepo-pnpm-two-apps`: two Next apps. Expect `needs-selection`; also scan with `appDir` each; paths repo-relative.
6. `monorepo-npm-turbo-one-app`: single app inside `apps/web`, shared package imported by schema (`packages/shared`), resolved through workspace import path inside the repo.
7. `routes-advanced`: route groups, private `_folder`, `[id]`, `[...slug]`, `[[...slug]]`, `@slot`, `(.)modal`,
   `layout/loading/error/not-found` ignored, nested, `route.ts` with all methods and re-export forms.
8. `alias-barrel`: tsconfig `paths`, `baseUrl`, barrel `index.ts`, `export *`, `export { a as b } from`, default export, a cycle, depth beyond limit.
9. `zod-schemas`: every supported builder and chain once; each unsupported builder once (refine, transform, lazy, record, discriminatedUnion, `zod/mini`); schema split across files; enum from `as const` array; sensitive field names (`password`, `cardNumber`, `pin`) and a trap `pinterestUrl` / `panel` that must NOT be sensitive.
10. `endpoints-input`: body parse, query parse, `searchParams.get`, no input, `formData()`, dynamic; GET that deletes (trap: access must stay `unknown`), POST that only searches.
11. `server-actions`: `"use server"` file with object action and parse, `z.infer` annotation action, FormData action, two-parameter action, inline `"use server"`, `@speeq read`/`@speeq write`/`@speeq-ignore`, a plain exported helper (trap: must NOT be discovered), a file without directive but with tagged function.
12. `forms`: native with `name` literals, select/textarea/checkbox/radio, dynamic name, password field, card fields with `autocomplete="cc-number"`, form with `action={serverAction}`, React Hook Form with zodResolver, two forms in one file, form with `id`.
13. `filters`: page parsing `searchParams` with a Zod schema (awaited and not), `useSearchParams().get` same file, `useSearchParams` in another file (trap: must NOT be discovered), a "Filter" component name with no evidence (trap).
14. `auth-detection`: next-auth, Clerk `clerkMiddleware` file with matcher, Supabase `getUser`, `proxy.ts`, a negative-lookahead matcher (`unknown`), a route with an auth-like variable name that is not a call (trap), middleware matcher that does not match the route.
15. `sensitive-routes`: `/admin/**`, `/login`, `/api/webhooks/stripe`, `/checkout`, `/account`, `/api/cron/x`, plus a public `/about` and `/blog/[slug]`.
16. `partial-speeq`: existing `speeq` dependency, `speeq.config.ts`, `.speeq/manifest.json` and `decisions.json`, existing `defineTool`/`defineRoute` calls.
17. `unsupported-dynamic`: computed property exports, `export * from "some-package"`, `await import()` of schema, conditional exports, a syntax-error file (`SQ0260`, scan continues), a 2 MiB file.
18. `integrations`: a package.json containing one package from every table row.

Tests:

- One test per fixture comparing `scan` to the ground truth through the scorer, asserting 100% on supported.
- Determinism: same result (deep-equal and byte-identical `JSON.stringify(manifest)`) across two runs,
  across a copy of the fixture in a different directory, and with different file-system listing order (mock).
- Cache: result with cache equals result without, for every fixture; touching one schema file reparses it
  and every importer and nothing else (assert `filesParsed` and the exact set via a stats hook); deleting a file;
  adding a file; changing `appDir`; changing `ANALYZER_VERSION`.
- `reconcile` table tests: new, approved-current, approved-stale, orphaned, moved (unique match), ambiguous move (two
  candidates, so not moved), approval without fingerprint, unknown-access capability with and without
  decision access, disabled, credentials-blocked cannot be approved into executable, admin with and without `allowSensitive`.
- `fingerprintOf` ignores id, file, line and changes when access, input, methods, sensitivity or auth observation change.
- Security: no writes during scan; no import/require of fixture code (a fixture module that throws or writes a
  marker file at load time must not trigger); `.env` secret string never appears in the manifest, diagnostics or cache;
  planted instruction comments change nothing; descriptions are capped and control characters stripped; a
  10 000-deep nested expression and a 5 MB-of-one-line file do not crash or hang (deadline and size cap);
  `appDir` with `..` or absolute path is rejected (`SQ0001`); symlinked app dir is not followed.
- Every diagnostic code added is emitted by at least one fixture (so none is dead).

## 8. Acceptance

- `scripts/verify.sh` passes
- `pnpm --filter @speeq/compiler eval` exits 0 with 100% on all supported fixtures; the report is pasted (summary only) in the handoff report
- `compiler-benchmark.md` has real measured numbers with commands, date and machine description
- Running `scan` on `apps/demo` (repo copy, read-only) produces a manifest; paste its inventory counts in the report and list anything in `apps/demo` that you consider a false positive or miss
- No new runtime dependency beyond `typescript` and `ignore`; dependency check passes
- Nothing under `packages/compiler` imports from `node:child_process`, `node:vm`, `node:worker_threads`, `node:net`, `node:http(s)` or `fs` write functions (assert with a test that greps `src`); only `RepoFs` touches `node:fs`, and only its read functions

## 9. Finish

Commit on the branch (Conventional Commits, scope `compiler`, no attribution). Write
`handoff/reports/016-compiler-discovery.md` using `handoff/REPORT_TEMPLATE.md` (may exceed 60 lines by up
to 30 for the milestone table and fixture scores) and print it. Under "Decisions I had to make" list
every ambiguity you resolved. Do not merge to main. Do not push.

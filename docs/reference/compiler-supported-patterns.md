# Compiler: supported patterns

`scan` reads your repository as data. It never runs your code, never calls a network or a model,
and never writes. Anything it does not understand is reported, not guessed. Every report has a
stable `SQ` code.

## What it finds

| Kind         | Source                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `route`      | App Router `page` files (`app/`, `src/app/`), Pages Router files (`pages/`, `src/pages/`)       |
| `endpoint`   | App Router `route` files (one capability per exported method), Pages Router `pages/api` files   |
| `function`   | Exports of `"use server"` files, and exports tagged `@speeq` in JSDoc                           |
| `form`       | Native `<form>` elements and React Hook Form `register("name")` calls                           |
| `filter-set` | A Zod schema parsed from a page's `searchParams`, or literal `useSearchParams().get("x")` reads |

Plain exported helper functions are **never** candidates. Tag one with `@speeq`, `@speeq read` or
`@speeq write` to offer it, or `@speeq-ignore` to exclude a server action.

## Routing rules

Route groups `(name)` are removed. `_private` folders are skipped. `[x]`, `[...x]` and `[[...x]]` are
dynamic, catch-all and optional catch-all (the last two need review because the navigation resolver
fills single `:name` segments only). `@slot` parallel routes (`SQ0140`) and intercepting routes
(`SQ0141`) are skipped. `layout`, `template`, `loading`, `error`, `not-found` and similar files are
ignored. A route defined by both routers is kept once (`SQ0142`). Titles come from a literal
`metadata` export, else the last static path segment.

## Access, sensitivity and authentication

- **Routes** are `read` (navigation). **Endpoints and functions are `unknown`** unless a function
  carries `@speeq read` or `@speeq write`. An HTTP method alone never proves a read or a write.
- **Sensitivity** comes from path words: `credentials` (login, auth, session...), `admin` (admin,
  webhooks, cron...), `financial` (checkout, billing...), `personal` (account, profile...). Credentials
  capabilities are never executable. Admin and financial ones are blocked unless a decision allows them.
  A schema field named like a password, token, PIN or card number makes the capability `credentials`.
- **Authentication** is evidence only: calls to well-known helpers (`auth`, `getServerSession`,
  `currentUser`, `getUser`, `withAuth`...) in the defining file, and middleware or `proxy` files with a
  literal `config.matcher` in the simple subset (`:param`, `:param*`, `:param+`, `:param?`, `(.*)`).
  A matcher using look-ahead is not interpreted (`SQ0160`). "Observed" never means "enforced".

## Zod schemas

Recognised: `z.object`, `z.strictObject`, `string`, `number`, `boolean`, `enum`, `literal`, `array`,
`union`, `coerce.string|number|boolean`; `.optional`, `.nullable`, `.nullish`, `.default(literal)`,
`.describe`, `.min`, `.max`, `.length`, `.gt`, `.gte`, `.lt`, `.lte`, `.int`, `.positive`, `.nonnegative`,
`.email`, `.url`, `.uuid`, `.regex` (no flags), `.trim`, `.toLowerCase`, `.toUpperCase`, `.extend`,
`.pick`, `.omit`, `.partial()`. References are followed through aliases, barrels and `export *` up to
eight hops. **Not supported** (whole schema needs review, `SQ0211`): `refine`, `superRefine`,
`transform`, `pipe`, `lazy`, `preprocess`, `brand`, `catch`, `record`, `tuple`, `map`, `set`,
`instanceof`, `custom`, `intersection`, `discriminatedUnion`. `zod/mini` is `SQ0210`. A schema that
cannot be found is `SQ0212`; a cycle or too deep a chain is `SQ0213`. A TypeScript type alone never
becomes a schema.

## Functions and endpoints

- A function's input comes from its single parameter: `z.infer<typeof S>` or `z.input<typeof S>` on
  the annotation, or `S.parse(param)` in the body. Form data actions are `SQ0221`, functions with
  several parameters `SQ0222`, no schema evidence `SQ0231`. Inline `"use server"` is `SQ0220`.
- An endpoint's input is understood only when the body is read once through `S.parse(await req.json())`
  (Pages Router: `S.parse(req.body)`), the query through `S.parse(Object.fromEntries(searchParams))`,
  literal `searchParams.get("x")` reads (needs review), or not at all. Handlers wrapped in another
  function, `formData()`, dynamic keys and routes with path parameters need review (`SQ0230`). Pages
  API methods are read from literal `req.method` comparisons only (`SQ0150`).

## Forms and filters

Forms are discovered, never operated: `runtimeBinding` is always `none` in this phase. Fields need
string-literal names (`SQ0240` otherwise). Password, card and one-time-code fields are marked
sensitive. Filter parameters come only from a schema or from literal reads in the page file itself,
never from labels or variable names (`SQ0250` when not understood).

## Not covered yet

OpenAPI documents, `tsconfig` project references, auth in layouts, filters that cross files, i18n and
`basePath` routing, and applications outside Next.js.

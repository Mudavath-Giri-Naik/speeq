# @speeq/compiler

## 0.12.1

### Patch Changes

- 3ab2636: Filters are found where real apps keep them: literal `useSearchParams().get("x")` reads in client components that a page imports from its own route folder (for example `./QuestionsClient` or `./_components/filters`, two levels deep) now become the route's query parameters, so the assistant can open the page already filtered. Shared components outside the route folder are never followed, and editing such a component re-runs discovery for the page.
- @speeq/core@0.12.1

## 0.12.0

### Minor Changes

- ca00970: Customer and page context. `defineContext` wraps a service your app already has (cart, enrollments, subscriptions, recent activity) so the agent can read the signed-in customer's current data through the new built-in `get_context` tool, or in the prompt with `load: "initial"`. Every result goes through the server-verified user, a sign-in check, a timeout, the output schema, a projection to the `expose` paths only, removal of restricted fields and secret-looking values, and size limits; it is cached for one request and never stored in conversation history. Page context gains an allow-list (`context.page.allow`), secret query parameters are removed from the path in the browser and on the server, and the store keeps context key names only by default for apps that set the allow-list. The system prompt now separates trusted instructions from data blocks (signed-in state, exposed profile, customer context, page context) with `<` and `>` escaped, and keeps the safety rules last. The sensitive-name list is shared between the compiler and the runtime.
- 80daf07: Discovery for personalisation. `discoverPersonalization({ root, manifest })` finds the app's sign-in system with file and line evidence (Auth.js v5, NextAuth v4, Supabase Auth, Clerk, Better Auth bound automatically; Kinde and your own helpers flagged for review; Firebase Auth reported as unsupported with what to do), candidate customer data sources from GET endpoints (category, response fields, sensitive fields, auth and user-scope evidence, whether they can be bound without code) and business facts from layout metadata, package.json and the README. It runs separately from `scan`, so rescans stay incremental. The integration engine renders a server-only `resolveUser` for a detected sign-in system and context sources that call your own endpoints with the visitor's cookies, exposing only approved fields; sensitive fields can never be approved and endpoints without a visible sign-in check need an explicit review.

### Patch Changes

- Updated dependencies [ca00970]
- Updated dependencies [b43d094]
- Updated dependencies [eafb316]
- Updated dependencies [22327d0]
  - @speeq/core@0.12.0

## 0.11.0

### Patch Changes

- @speeq/core@0.11.0

## 0.10.0

### Patch Changes

- @speeq/core@0.10.0

## 0.9.0

### Patch Changes

- @speeq/core@0.9.0

## 0.8.0

### Patch Changes

- @speeq/core@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [54755b9]
  - @speeq/core@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [d687185]
  - @speeq/core@0.6.0

## 0.5.0

### Minor Changes

- 81d3a6c: Add the `speeq` command: `npx speeq init` scans a Next.js App Router app, lets you approve what the assistant may use and writes the glue code. `speeq doctor` and `speeq verify` report static, runtime and host readiness separately. The CLI, integration engine and compiler packages are now published.

### Patch Changes

- @speeq/core@0.5.0

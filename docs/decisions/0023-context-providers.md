# ADR-0023 — Context providers: the host app's own services, projected, bounded and fresh

Status: Accepted (task 023). Implements ADR-0019 and fixes its open questions.

## Context

The agent needs the customer's cart, enrollments, subscriptions or recent activity, and a better picture
of the current page. The app already has these services. Copying them into a speeq database, scraping
the DOM or sending whole records to a model are all wrong (privacy, staleness, injection).

## Decision

1. **`defineContext`** (in `@speeq/server`, exported from `speeq/server`):
   `{ id, description, category, auth: "required" | "optional", load: "initial" | "on-demand",
   output: ZodType, expose: string[], sensitive?: string[], greeting?: string[], maxItems?: number,
   maxChars?: number, timeoutMs?: number, fetch(ctx: AgentContext<TUser>): Promise<unknown> }`.
   `category` is one of `identity | ownership | activity | commerce | learning | application | custom`.
   `fetch` receives the **server-verified** user (never client data) and calls the app's existing service.
2. **Pipeline, every call, in this order:** `auth: "required"` without a user → `UNAUTHENTICATED` result,
   `fetch` not called → timeout (default 1500 ms) → output schema (`safeParse`; failure →
   `TOOL_ERROR`, timeouts `TOOL_TIMEOUT`, budget `RATE_LIMITED`: existing codes, so no protocol change) → **projection**: keep only `expose` paths (`a.b`, `items[].title`); everything
   else is dropped, never "everything but secrets" → screen: drop any key on the shared sensitive-name
   list or in `sensitive`, and secret-shaped values (JWT, long hex/base64, card number) → bound arrays to
   `maxItems` (default 20) and the JSON to `maxChars` (default 2000), marking `truncated: true` →
   render as an untrusted data block. A projection that ends empty is reported as such.
3. **Loading.** `initial` providers run at turn start, in parallel, at most `budget.maxInitial` (default 2),
   only when a user is present or `auth: "optional"`. `on-demand` providers are offered to the model
   through one built-in tool, **`get_context`** `{ source: enum(provider ids) }`, listed with one-line
   descriptions. Total per turn: `budget.maxCalls` (default 4), `budget.maxChars` (default 6000).
4. **Freshness.** Results are cached for the current HTTP request only (per provider id). No cross-request
   cache in this release, so there is nothing to scope or leak. History keeps a placeholder
   (`{"source":"cart","note":"retrieved earlier, fetch again for current data"}`) instead of the
   result: stored conversations never hold provider output, and the model must re-fetch.
5. **Page context (ADR-0019 decisions 1 to 7).** `context.page: { allow: string[], maxBytes?: 2000,
   store?: "keys" | "full" | "none" }`. With a `context.page` block, `data` keys not allowed are dropped and
   counted; `path` loses secret-like query parameters on client and server. Without the block (existing
   apps), behaviour is unchanged for 0.12 with a one-time warning. New integrations get the block.
   Recommended slot names (documented, not enforced): `selected: { type, id, title? }`, `filters`,
   `search`, `form`, `step`. The model resolves "this question" from `selected` and fetches it with a tool,
   which enforces authorisation. Client context never grants anything.
6. **Prompt layering**, fixed order, built by one function:
   trusted (agent identity and developer instructions, business profile, style, language, navigation,
   capabilities) → data (`<user_profile>`, `<customer_context source=…>`, `<page_context>`, preferences
   from ADR-0025) → safety rules last. Data blocks are serialised JSON with the same neutralising as tool
   results; a display name or product text containing instructions is only data.
7. **The sensitive-name list moves to `@speeq/core/utils`** (`isSensitiveName`), and the compiler imports
   it from there, so compiler and runtime cannot drift.
8. **Telemetry**: never. The forbidden-fields test gains every new field name.

## Alternatives rejected

- Denylist projection: one new field leaks. Allow-list only.
- TTL caches: serverless instances and per-user scoping make them a leak risk for a small gain.
- A context database or embeddings: duplicates the app's data and goes stale.

## Consequences

Apps get personalisation by writing one small `defineContext` around an existing service; the compiler
(task 026) proposes these for review. Answers that need private data cost one `get_context` call.

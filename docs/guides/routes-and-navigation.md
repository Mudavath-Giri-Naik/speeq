# Register routes

Give the model route IDs and schema-checked parameters. For example, register this definition in the server's `routes` array:

```ts
import { defineRoute } from "@speeq/server";
import { z } from "zod";
export const article = defineRoute({
  id: "article",
  title: "Article",
  path: "/articles/:slug",
  params: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) }),
});
```

The built-in `navigate` tool resolves the route and emits `{ routeId, href, params }`. Parameters used in the path fill its segments. Remaining parameters form the query string. Route IDs must be unique. Define only destinations the host is willing to open. Pages must enforce their own access checks.

In the provider, pass `onNavigate={({ href }) => router.push(href)}`. A descendant can register `useSpeeqContext({ articleId })` to give the next turn a reference to the current article. [Complete router integration](nextjs.md)

---

title: Open pages (routes)
description: Tell the assistant which pages exist, so it can send visitors to the right one.
---

# Open pages (routes)

**What you will learn:** how to let the assistant open pages on your site, safely.

You give the assistant a short list of **routes**. A route is a name, a path, and optional values. When a visitor says "show me pricing", the assistant picks a route and your page opens.

## Define a route

```ts
import { defineRoute } from "speeq/server";
import { z } from "zod";

export const pricing = defineRoute({ id: "pricing", title: "Pricing", path: "/pricing" });

export const article = defineRoute({
  id: "article",
  title: "Article",
  path: "/articles/:slug",
  params: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) }),
});
```

Pass them to the server:

```ts
createSpeeq({
  // ...agent, llm, store as before
  routes: [pricing, article],
});
```

- **id** is a unique name.
- **path** is the real URL. Words that start with `:` are filled in from `params`.
- **params** describe the values the page needs. Keep them strict, so the assistant can only build valid links.

## Open the page in the browser

When the assistant picks a route, your browser code gets an event with the final `href`. You decide what to do with it:

```tsx
<SpeeqProvider endpoint="/api/speeq" onNavigate={({ href }) => router.push(href)}>
```

## Safety rules

- Only list pages that **any visitor** may be sent to.
- Opening a page is **not** permission to see it. Each protected page must still check the visitor on its own.
- Do not list admin or destructive pages unless you really mean to.

## Tell the assistant which page you are on

A client component can share facts about the page it shows:

```tsx
useSpeeqContext({ articleId: "abc" });
```

The next message includes this, so "summarize this article" has something to point at.

## Next steps

- [Let it do things (tools)](/docs/guides/tools)
- [Go to production](/docs/guides/deployment)

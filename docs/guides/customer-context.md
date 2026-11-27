# Customer and page context

The agent answers better when it knows what is on the screen and what the signed-in customer owns.
speeq gets both from your app, never from a copy: page context comes from your components, customer
context from services you already have. Nothing is scraped and nothing is synced into a speeq database.

## Page context: what is on the screen

Publish small facts from a component with `useSpeeqContext`, and allow the keys on the server.

```tsx
"use client";
import { useSpeeqContext } from "speeq/react";

export function QuestionContext({ id, title }: { id: string; title: string }) {
  useSpeeqContext({ selected: { type: "question", id, title } });
  return null;
}
```

```ts
// speeq.config.ts
createSpeeq({
  // ...
  context: { page: { allow: ["selected", "filters", "search"] } },
});
```

Only allowed keys reach the model, after restricted names (passwords, tokens, cards, ids) and
secret-looking values are removed. The path always loses secret query parameters such as `token`,
`code` or `email`. The store keeps key names only (`store: "keys"`); use `"full"` or `"none"` to change
that. Useful slot names: `selected` (`{ type, id, title }`), `filters`, `search`, `form`, `step`. With
`selected` the agent understands "explain this question" and fetches it with your tool, which still
checks permissions. Page context is browser data: it never grants access to anything.

## Customer context: what the customer owns

Wrap an existing service with `defineContext`. `fetch` gets the user that `resolveUser` verified on
the server; the browser cannot choose it.

```ts
import { defineContext } from "speeq/server";
import { z } from "zod";
import { getEnrollments } from "@/services/courses";

export const enrollments = defineContext({
  id: "enrolled_courses",
  description: "Courses the student is enrolled in, with progress",
  category: "ownership",
  output: z.object({
    courses: z.array(z.object({ title: z.string(), progress: z.number(), paymentRef: z.string() })),
  }),
  expose: ["courses[].title", "courses[].progress"], // paymentRef never reaches the model
  fetch: async (ctx) => ({ courses: await getEnrollments(ctx.user!.id) }),
});

createSpeeq({ /* ... */ context: { providers: [enrollments] } });
```

How it runs:

- **On demand by default.** The model calls the built-in `get_context` tool with a source id when a
  question needs it ("what courses do I have?"). `load: "initial"` puts a small source in the prompt on
  every message instead; keep those tiny.
- **Signed-in only by default** (`auth: "required"`): a visitor gets "please sign in", and `fetch` is
  not called. Use `auth: "optional"` for public data such as the product on screen.
- **Projected, not filtered.** Only `expose` paths reach the model; restricted names and secret-shaped
  values are removed even inside exposed objects. Arrays are cut to `maxItems` (20) and the JSON to
  `maxChars` (2000).
- **Fresh.** Results are cached for one request only. Conversation history stores a placeholder, not
  the data, so the agent fetches again later instead of trusting a stale cart or an expired course.
- **Bounded.** `timeoutMs` (1500), and per message `context.budget` (2 initial sources, 4 fetches,
  6000 characters).
- **Data, not instructions.** Results, profile names and page context are put in delimited data blocks
  with `<` and `>` escaped, below the developer instructions and above the safety rules.

Ownership is always the app's answer: the prompt tells the agent that what a customer owns or can
access comes only from these sources, never from the conversation or memory.

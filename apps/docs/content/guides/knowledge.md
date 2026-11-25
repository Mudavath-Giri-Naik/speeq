---

title: Let it answer from your content
description: Add searchable help articles or docs, so the assistant answers with your own words.
---

# Let it answer from your content

**What you will learn:** how to connect help articles, docs, or FAQs, so the assistant can search them and answer.

A **knowledge source** is a search function you write. When a visitor asks a question, the model can search your sources, read the best results, and answer from them.

## Your first source

```ts
import { defineKnowledgeSource } from "speeq/server";

export const help = defineKnowledgeSource({
  id: "help",
  description: "Product help articles",
  async search(query) {
    return /pricing/i.test(query)
      ? [
          {
            id: "plans",
            title: "Plans",
            content: "The pricing page lists the plans.",
            href: "/pricing",
          },
        ]
      : [];
  },
});
```

Add it to your server:

```ts
createSpeeq({
  // ...agent, llm, store as before
  knowledge: [help],
});
```

- **id** must be unique for each source.
- **description** tells the model what is inside, so it knows when to search.
- **search** gets the visitor's question and returns a short list. Each result has an `id`, a `title`, some `content`, and an optional `href` for a link.

In a real app, `search` would call your database or a search service. Return a handful of the best matches, not everything.

## How the model uses it

The model gets a built-in tool called `search_knowledge`. It calls it, reads your results, and writes the answer. You do not need to write that part.

> **Note** Search results are treated as **untrusted text**. If your content could contain text written by users, keep that in mind. Do not store secrets in anything the assistant can search.

## Next steps

- [Let it do things (tools)](/docs/guides/tools)
- [Open pages (routes)](/docs/guides/routes)

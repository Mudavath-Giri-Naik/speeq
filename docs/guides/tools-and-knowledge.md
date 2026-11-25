# Add tools and knowledge

Use a tool for a specific operation and a knowledge source for searchable passages. Both execute in your backend. Scope queries to the resolved user and validate all model-supplied arguments.

```ts
import { defineKnowledgeSource, defineTool } from "@speeq/server";
import { z } from "zod";

export const countWords = defineTool({
  name: "count_words",
  description: "Count words in supplied text.",
  input: z.object({ text: z.string().trim().min(1).max(500) }),
  handler: ({ text }) => ({ count: text.split(/\s+/).length }),
});
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

Pass `tools: [countWords], knowledge: [help]` to `createSpeeq`. Give each source a unique ID. The model can call `search_knowledge` to retrieve content. Treat tool output and search hits as untrusted. For mutations set `risk: "write"` and supply a human-readable confirmation summary. [Confirmation flow](../concepts/confirmations.md)

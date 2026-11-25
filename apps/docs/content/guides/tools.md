---

title: Let it do things (tools)
description: Give the assistant safe actions, like looking up an order or counting items.
---

# Let it do things (tools)

**What you will learn:** how to give the assistant a new ability, and how to keep it safe.

A **tool** is a small function that you write. The assistant can ask to run it. The tool runs **on your server**, with your database and your rules. The model never touches your data directly.

## Your first tool

```ts
import { defineTool } from "speeq/server";
import { z } from "zod";

export const countWords = defineTool({
  name: "count_words",
  description: "Count words in supplied text.",
  input: z.object({ text: z.string().trim().min(1).max(500) }),
  handler: ({ text }) => ({ count: text.split(/\s+/).length }),
});
```

Then pass it to `createSpeeq`:

```ts
createSpeeq({
  // ...agent, llm, store as before
  tools: [countWords],
});
```

Each part has a job:

- **name** is what the model calls. Use letters, numbers, `_` or `-`, up to 64 characters.
- **description** tells the model what the tool does and when to use it. Write it clearly. This is how the model decides.
- **input** describes the data the tool needs, using zod. speeq checks the model's input against it. Wrong input never reaches your code.
- **handler** is your code. Whatever it returns is sent back to the model.

## Know who is asking

Your handler gets a second argument with `ctx.user`. It is the signed-in visitor, or `null` for an anonymous one.

```ts
handler: async ({ status }, ctx) => {
  if (!ctx.user) throw new SpeeqError("FORBIDDEN");
  return { count: await countOrdersFor(ctx.user.id, status) };
},
```

`SpeeqError` is exported from `speeq/server`. Replace `countOrdersFor` with your own data function.

> **Warning** The assistant is not a security layer. **Check permissions inside every tool**, the same way your website would. Always use `ctx.user.id` to find the data. Never trust an ID that came from the model.

## Tools that change things

If a tool creates, edits, deletes or sends something, mark it as a write:

```ts
defineTool({
  name: "cancel_order",
  description: "Cancel one of the user's open orders.",
  input: z.object({ orderId: z.string().max(40) }),
  risk: "write",
  confirmationSummary: ({ orderId }) => `Cancel order ${orderId}?`,
  handler: async ({ orderId }, ctx) => {
    // check that the order belongs to ctx.user, then cancel it
    return { cancelled: true };
  },
});
```

Write tools **ask the visitor first**. The visitor sees your summary text and chooses Approve or Reject. Read [Asking before changes](/docs/concepts/confirmations) to see how this works.

## Good habits

- Return **only what is needed**. No password hashes, tokens, or other people's data.
- Keep inputs strict. Use `.max()` on text and enums when the choices are known.
- Treat tool results as untrusted text. Never put secrets in them.
- A tool has 8 seconds by default. Change it with `timeoutMs` on the tool.

## Next steps

- [Let it answer from your content (knowledge)](/docs/guides/knowledge)
- [Test tools without a model](/docs/guides/testing)

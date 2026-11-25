---

title: Asking before changes
description: How speeq makes the visitor approve any action that changes data.
---

# Asking before changes

**What you will learn:** how the Approve and Reject flow works, and why it is safe.

An assistant can make mistakes, or be tricked by text in a web page. So speeq **never changes your data on its own**. A tool that changes something must be marked as a write, and a write needs a Yes from the visitor.

## How it looks

1. The visitor says: "Cancel my last order."
2. The model asks to run `cancel_order`.
3. speeq **pauses**. The browser gets a pending request with a summary, like "Cancel order 1234?".
4. The visitor presses **Approve** or **Reject**.
5. Only after Approve does your tool run.

## What you build

Mark the tool as a write and give it a clear summary:

```ts
defineTool({
  name: "cancel_order",
  description: "Cancel one of the user's open orders.",
  input: z.object({ orderId: z.string().max(40) }),
  risk: "write",
  confirmationSummary: ({ orderId }) => `Cancel order ${orderId}?`,
  handler: async ({ orderId }, ctx) => {
    return { cancelled: true };
  },
});
```

In the browser, show `pendingConfirmation.summary` with two buttons:

```tsx
function ApprovalBox() {
  const { pendingConfirmation, confirm } = useSpeeq();
  if (!pendingConfirmation) return null;
  const { confirmationId, summary } = pendingConfirmation;
  return (
    <div role="alertdialog">
      <p>{summary}</p>
      <button onClick={() => void confirm(confirmationId, true)}>Approve</button>
      <button onClick={() => void confirm(confirmationId, false)}>Reject</button>
    </div>
  );
}
```

Never approve for the visitor automatically.

## Why it is safe

- The pending request is **saved in your store**, not in the browser. The browser only sends back an ID and a yes or no.
- Each request can be answered **only once**. A second answer, even at the same moment, gets a `CONFLICT` error. So a replay cannot run the tool twice.
- The tool runs with arguments that were checked again.

## Things to remember

- **Check permissions again** inside the tool. The Yes only says the visitor agrees, not that they are allowed.
- Make side effects safe to repeat when you can. If the server crashes right after approval, the run can be interrupted.

## Next steps

- [Let it do things (tools)](/docs/guides/tools)
- [The audit log](/docs/concepts/audit)

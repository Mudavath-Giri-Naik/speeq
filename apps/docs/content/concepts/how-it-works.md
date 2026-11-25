---

title: How it works
description: What happens between a visitor speaking and the page answering.
---

# How it works

**What you will learn:** the journey of one message, from the visitor to the answer.

## The big picture

```text
Browser (your page)
   │  1. The visitor types or speaks
   ▼
Your server (speeq handler)
   │  2. Loads recent history from your store
   │  3. Asks your model what to do
   ▼
Your model  ──►  "Run the tool find_order" or "Say this reply"
   │
   ▼
Your tools and data   (checked, with the visitor's permissions)
   │
   ▼
Back to the browser, streaming: text, page opens, approvals
```

## One turn, step by step

1. **The visitor says something.** The browser sends the text, the language, and what page the visitor is on. The first message also creates a **session**.
2. **Your server wakes up.** It checks the session, then loads the recent conversation from your database.
3. **The model decides.** speeq sends your instructions, the history, and the list of tools to the model.
4. **Text streams back.** As the model writes, the words flow to the page a few at a time.
5. **The model may ask for a tool.** Your server checks the input, runs your function with the current user's permissions, and gives the result to the model. The model may then use another tool, open a page, or write the final answer.
6. **Changes ask first.** If a tool changes data, the turn pauses and the visitor sees an Approve or Reject choice.
7. **Everything is saved.** Each step is written to your store as an event.

## Why the server remembers nothing

Your database is the memory. Each turn loads history from the store, so any server copy can answer any request. This also gives you the audit log for free.

## The messages the browser receives

The server sends a stream of small events. The most useful ones:

| Event                            | Meaning                             |
| -------------------------------- | ----------------------------------- |
| `assistant.delta`                | A few more words of the answer      |
| `assistant.message`              | The full finished message           |
| `tool.started` / `tool.finished` | A tool began or ended               |
| `navigate`                       | Open this page                      |
| `confirmation.required`          | Ask the visitor to approve a change |
| `turn.finished`                  | The turn is over, with the reason   |

The React hooks turn these into simple values like `messages` and `pendingConfirmation`. The full list is in the [HTTP protocol](/docs/reference/protocol).

## Next steps

- [Sessions and security](/docs/concepts/security)
- [Asking before changes](/docs/concepts/confirmations)

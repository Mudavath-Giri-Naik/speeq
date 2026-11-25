---

title: The audit log
description: A record of what the assistant heard, said, and did, and how to keep it private.
---

# The audit log

**What you will learn:** what is recorded, who can read it, and how to protect it.

Each conversation is saved as a **session** with a list of **events**, in order. Events include messages from the visitor and the assistant, tool calls, page opens, approvals, and errors. You can replay a conversation from start to end.

## Who can read it

The audit routes are **closed by default**. They return 404 until you give speeq an `authorize` function that checks your admin login. If the function says no, or throws, the answer is 403. See [Build an audit viewer](/docs/guides/audit-viewer).

## Keeping private data out

- **Masking.** Tool argument names that look secret are masked before saving.
- **Your own filter.** `audit.redact(event)` can change an event, or return `null` to drop it.
- **Expiry.** `audit.retentionDays` expires sessions after the number of days since their last activity. Run `speeq.purgeExpired()` from a scheduled job to make deletion dependable.

> **Note** Changing or removing events also changes what the model sees on later turns, because history is read from the same place. Test your filters.

## Where it is stored

In **your** store, in your own database. speeq has no copy.

## Next steps

- [Privacy and telemetry](/docs/concepts/privacy)
- [Choose a store](/docs/guides/stores)

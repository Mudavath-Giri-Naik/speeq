---

title: Build an audit viewer
description: Let your admins read past conversations, with a login check on the server.
---

# Build an audit viewer

**What you will learn:** how to show your admins what the assistant said and did.

Every conversation is saved as a list of events: messages, tool calls, page opens, approvals, and errors. An **audit viewer** is an admin page that reads them.

## Step 1: lock the audit routes on the server

By default, the audit routes return 404, so they are closed. To open them, tell speeq how to check your admin:

```ts
createSpeeq({
  // ...agent, llm, store as before
  audit: {
    authorize: async (request) => {
      // your real check. Return true only for administrators.
      return await isAdmin(request);
    },
  },
});
```

`isAdmin` is your own function. It reads your login cookie from the request. If it returns anything other than `true`, or throws, the request is refused with 403.

> **Warning** Hiding a link in the UI does not protect your data. The check on the server is the real lock.

## Step 2: show the data in a protected page

On a page that only admins can open, use the hooks:

```tsx
"use client";
import { useAuditSession, useAuditSessions } from "speeq/react";

export function AuditList() {
  const { sessions, loading, error, hasMore, loadMore } = useAuditSessions({
    endpoint: "/api/speeq",
    filter: { limit: 25 },
  });
  // render sessions, and a "Load more" button when hasMore is true
}
```

- `useAuditSessions` lists conversations, newest first, with paging.
- `useAuditSession(id, { endpoint })` loads one conversation and its events in order. Pass `null` when nothing is picked.
- Both send your cookies, so your admin login works. They do not need the conversation provider.

## Keep sensitive data out

Secret-looking tool argument names are hidden before saving. For other private data, add `audit.redact`. It can change an event, or return `null` to drop it. Use `audit.retentionDays` to delete old sessions, and run `speeq.purgeExpired()` from a scheduled job.

## Next steps

- [The audit log](/docs/concepts/audit)
- [Privacy and telemetry](/docs/concepts/privacy)

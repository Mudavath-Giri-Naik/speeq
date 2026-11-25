# Build an audit viewer

Protect the host admin page on the server. Also supply `audit.authorize(request)` when creating the speeq server. Have it verify the host login and administrator role for each audit request. Hiding a UI link does not protect the underlying API.

Inside your protected page, render a client component using `useAuditSessions({ endpoint: "/api/speeq", filter: { limit: 25 } })`. Iterate over `sessions`, use `hasMore` and `loadMore()` for pagination, and `refresh()` to reload. Pass a selected ID or `null` to `useAuditSession(selectedId, { endpoint: "/api/speeq" })`. Display `events` in sequence and handle loading and error states separately. The hooks include cookies by default and work outside the conversation provider. [Complete viewer component](../../packages/react/README.md)

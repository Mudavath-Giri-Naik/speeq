# Conversation audit

Each session has a summary and a sequence of events covering user and assistant messages, tools, navigation, confirmation decisions and errors. The store assigns sequence numbers so a reader can replay events in order.

Provide `audit.authorize(request)` to check your administrator's host session on every list or detail request. With no callback the routes return 404. A denial or thrown exception returns 403.

Secret-looking tool argument keys are masked before storage. Implement `audit.redact(event)` to filter other sensitive content or return `null` to omit an event. Dropping or rewriting events affects later model history and confirmation resumes. Use `retentionDays` to expire sessions by last activity and schedule `speeq.purgeExpired()` for dependable cleanup. [Build an audit viewer](../guides/audit-viewer.md)

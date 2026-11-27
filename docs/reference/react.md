# React bindings

`SpeeqProvider` accepts `children`, the client options including required `endpoint`, and an optional existing `client`. If you supply a client it manages its own options and lifetime. Otherwise the provider creates one client and cancels active work on unmount. Use a client component for hooks. [Client options](client.md)

| Hook                          | Result                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| useSpeeqForm(formId, binding) | Fill a draft of one form; never submits; skips fields the visitor edited.                                                                                      |
| useSpeeq()                    | Live snapshot, client, sendText, startListening, stopListening, cancel, setLanguage, confirm, resolveUiAction and speak, plus pendingUiAction in the snapshot. |
| useSpeeqIdentity()            | `{ identity, refresh }`: who the server says is talking. Call `refresh()` right after your own login or logout.                                                |
| useSpeeqEvent(event, handler) | Subscribes to one public client event for the component lifetime.                                                                                              |
| useSpeeqContext(data)         | Merges mounted page data into requests on a provider-owned client. Later registrations take precedence.                                                        |
| useSpeeqAudit(options)        | Independent audit client with listSessions and getSession.                                                                                                     |
| useAuditSessions(options)     | sessions, loading, error, hasMore, loadMore and refresh. Accepts audit options and optional filter.                                                            |
| useAuditSession(id, options)  | Selected session, events, loading, error and refresh. Pass null for no selection.                                                                              |

Conversation hooks require a provider. Audit hooks use the supplied endpoint and can render on a separate admin page. [Viewer guide](../guides/audit-viewer.md)

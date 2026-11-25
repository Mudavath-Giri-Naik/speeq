# HTTP and SSE protocol

Paths are relative to the mounted handler. Use JSON bodies and send the host's credentials. Turn and confirmation requests also require `Authorization: Bearer <sessionToken>`.

| Method and path           | Input                                                                                      | Success                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET /health               | None                                                                                       | ok, protocolVersion, sdkVersion                                                                                                         |
| POST /session             | Optional language and context                                                              | sessionId, sessionToken, expiresAt, protocolVersion and config (agent name, languages, default language, feature flags and route hints) |
| POST /session/:id/turn    | text (1–2000 trimmed characters), language, optional context and inputMode (text or voice) | SSE stream                                                                                                                              |
| POST /session/:id/confirm | confirmationId, approved (boolean)                                                         | SSE resume                                                                                                                              |
| GET /audit/sessions       | Optional userId, from, to, limit and cursor query parameters                               | sessions, nextCursor                                                                                                                    |
| GET /audit/sessions/:id   | Host admin credentials                                                                     | session, events                                                                                                                         |
| OPTIONS                   | Origin preflight                                                                           | 204 when allowed                                                                                                                        |

Page context contains a required path, optional title and optional data object. Before streaming, errors use `{ error: { code, message, retryable, retryAfterMs? } }`. After streaming starts, inspect events. [Error codes](errors.md)

Every SSE frame has an event name and JSON data with `type`, `protocolVersion: 1` and `turnId`. Additional fields:

| Event                 | Fields                                             |
| --------------------- | -------------------------------------------------- |
| turn.started          | sessionId, language                                |
| assistant.delta       | text                                               |
| assistant.message     | messageId, text (complete message)                 |
| tool.started          | callId, name, kind (builtin/custom)                |
| tool.finished         | callId, name, ok, durationMs, optional errorCode   |
| navigate              | routeId, href, params                              |
| confirmation.required | confirmationId, toolName, summary, args            |
| error                 | code, message, retryable, optional retryAfterMs    |
| turn.finished         | reason, latencyMs, optional firstTokenMs and usage |

End reasons are completed, max_steps, confirmation_required, error and aborted. Usage may contain inputTokens, outputTokens and totalTokens. On confirmation_required, display the pending request and send the user's choice to the confirm endpoint.

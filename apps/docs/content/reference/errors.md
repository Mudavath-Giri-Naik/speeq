---

title: Error codes
description: Every error code speeq can return, what it means, and what to do.
---

# Error codes

Errors have a stable `code`, a `message`, and a `retryable` flag. Before a stream starts, they come as JSON with an HTTP status. Inside a stream, they come as an `error` event. If `retryAfterMs` is present, wait that long first.

| Code                    | HTTP | Retry? | What it means and what to do                                      |
| ----------------------- | ---- | ------ | ----------------------------------------------------------------- |
| `UNAUTHENTICATED`       | 401  | No     | Sign in, or get a new session.                                    |
| `FORBIDDEN`             | 403  | No     | Check the user, the origin, and permissions.                      |
| `INVALID_INPUT`         | 400  | No     | Fix the request body or tool input.                               |
| `NOT_FOUND`             | 404  | No     | Check the path. Audit routes need an `authorize` function.        |
| `CONFLICT`              | 409  | No     | Already handled, for example an approval answered twice. Refresh. |
| `RATE_LIMITED`          | 429  | Yes    | Wait, then try again.                                             |
| `SPEECH_UNAVAILABLE` | 503 | No | Voice is not available right now. You can type instead. |
| `PAYLOAD_TOO_LARGE` | 413 | No | That audio is too long. |
| `PROVIDER_ERROR`        | 502  | Yes    | The model service failed. Retry with a short wait.                |
| `TOOL_ERROR`            | 500  | No     | A tool failed. Read the server logs.                              |
| `TOOL_TIMEOUT`          | 504  | Yes    | A tool took too long. Check for side effects before retrying.     |
| `CONFIRMATION_REQUIRED` | 409  | No     | Show the visitor the pending choice.                              |
| `SESSION_EXPIRED`       | 401  | Yes    | Start a new session.                                              |
| `NOT_CONFIGURED`        | 500  | No     | The server or model settings need fixing.                         |
| `INTERNAL`              | 500  | No     | Look in the server logs.                                          |

The "Retry?" column shows the default. A server can change it, so read the `retryable` flag in the response.

In your code, use `isSpeeqError(error)` to recognise a speeq error, even if two copies of the package are bundled. Keep error details on the server. Only show user-safe text to visitors.

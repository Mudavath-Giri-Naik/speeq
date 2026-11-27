# Error codes

Plain JSON errors use these default HTTP statuses. SSE errors carry the same codes inside an open stream. Read the returned retryable flag and optional retryAfterMs because an instance can override the defaults.

| Code                  | HTTP | Retryable default | Meaning and response                                                                                                         |
| --------------------- | ---- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| UNAUTHENTICATED       | 401  | No                | Sign in or obtain fresh session credentials.                                                                                 |
| FORBIDDEN             | 403  | No                | Check the current user, origin and permissions.                                                                              |
| INVALID_INPUT         | 400  | No                | Correct the request body or tool arguments.                                                                                  |
| NOT_FOUND             | 404  | No                | Check the path or resource. Audit routes require an authorization callback.                                                  |
| CONFLICT              | 409  | No                | The action was already handled. Refresh state.                                                                               |
| RATE_LIMITED          | 429  | Yes               | Wait for the indicated interval before retrying.                                                                             |
| PROVIDER_ERROR        | 502  | Yes               | Model service failed. Retry with backoff.                                                                                    |
| TOOL_ERROR            | 500  | No                | Tool execution failed. Inspect server diagnostics.                                                                           |
| TOOL_TIMEOUT          | 504  | Yes               | Tool exceeded its deadline. Check for side effects before retrying.                                                          |
| CONFIRMATION_REQUIRED | 409  | No                | Present the pending choice to the user.                                                                                      |
| SESSION_EXPIRED       | 401  | Yes               | Start a fresh session.                                                                                                       |
| NOT_CONFIGURED        | 500  | No                | Operator must correct server or provider settings.                                                                           |
| INTERNAL              | 500  | No                | Inspect server-side diagnostics using the operation context.                                                                 |
| IDENTITY_CHANGED      | 401  | No                | The signed-in user or tenant changed (login, logout, switch). The client resets the conversation and starts a fresh session. |
| AUTH_UNAVAILABLE      | 503  | Yes               | The app's own sign-in check failed. Nothing private ran; the session is kept. Retry shortly.                                 |

Since 0.12 an error may also carry a stable `reason` that refines the code: `invalid_key`, `not_configured`, `rate_limited`, `busy`, `quota_exhausted`, `model_unavailable`, `unsupported_language`, `network`, `timeout`, `speech_unavailable`, `storage_unavailable`, `auth_required`, `context_unavailable`. The public message then comes from a fixed customer-safe table (`DEFAULT_REASON_MESSAGES`). Provider bodies, keys and prompts are never part of a payload; in development the server logs one diagnostic line instead.

Use `isSpeeqError` to recognize errors across bundled copies. Keep causes and details server-side and use only user-safe text in a custom public message.

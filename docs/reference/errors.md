# Error codes

Plain JSON errors use these default HTTP statuses. SSE errors carry the same codes inside an open stream. Read the returned retryable flag and optional retryAfterMs because an instance can override the defaults.

| Code                  | HTTP | Retryable default | Meaning and response                                                        |
| --------------------- | ---- | ----------------- | --------------------------------------------------------------------------- |
| UNAUTHENTICATED       | 401  | No                | Sign in or obtain fresh session credentials.                                |
| FORBIDDEN             | 403  | No                | Check the current user, origin and permissions.                             |
| INVALID_INPUT         | 400  | No                | Correct the request body or tool arguments.                                 |
| NOT_FOUND             | 404  | No                | Check the path or resource. Audit routes require an authorization callback. |
| CONFLICT              | 409  | No                | The action was already handled. Refresh state.                              |
| RATE_LIMITED          | 429  | Yes               | Wait for the indicated interval before retrying.                            |
| PROVIDER_ERROR        | 502  | Yes               | Model service failed. Retry with backoff.                                   |
| TOOL_ERROR            | 500  | No                | Tool execution failed. Inspect server diagnostics.                          |
| TOOL_TIMEOUT          | 504  | Yes               | Tool exceeded its deadline. Check for side effects before retrying.         |
| CONFIRMATION_REQUIRED | 409  | No                | Present the pending choice to the user.                                     |
| SESSION_EXPIRED       | 401  | Yes               | Start a fresh session.                                                      |
| NOT_CONFIGURED        | 500  | No                | Operator must correct server or provider settings.                          |
| INTERNAL              | 500  | No                | Inspect server-side diagnostics using the operation context.                |

Use `isSpeeqError` to recognize errors across bundled copies. Keep causes and details server-side and use only user-safe text in a custom public message.

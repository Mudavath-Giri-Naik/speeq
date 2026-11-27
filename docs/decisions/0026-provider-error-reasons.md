# ADR-0026 — Provider errors carry a stable reason; customers get a sentence, developers a diagnosis

Status: Accepted (task 024). Decision 3 ships as the development log line only; the doctor reads no runtime file.

## Decision

1. `ErrorPayload` gains optional `reason`, a stable string from `ERROR_REASONS` in `core/errors.ts`:
   `invalid_key`, `not_configured`, `rate_limited`, `busy`, `quota_exhausted`, `model_unavailable`,
   `unsupported_language`, `network`, `timeout`, `speech_unavailable`, `storage_unavailable`,
   `auth_required`, `context_unavailable`. Codes stay as they are; reasons refine them. Never renamed.
2. `provider-http.ts` maps status and body patterns to a reason; it never copies body text into the
   payload. Customer messages come from a fixed table per reason (`DEFAULT_REASON_MESSAGES`).
3. Developer diagnostics: in development (`NODE_ENV !== "production"`) the logger prints one line
   `provider=groq status=429 reason=rate_limited retryAfterMs=…` with bodies passed through the existing
   secret redaction and cut to 200 chars. `speeq doctor` shows the last reason per provider kind from a
   dev-only file `.speeq/last-errors.json` (reasons and counts only).
4. Never in any payload, log or file: keys, authorization headers, prompts, stack traces, customer data.

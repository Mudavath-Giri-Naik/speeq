# REPORT 024 — Business profile, agent style, greetings, starters, error reasons, presets

Status: DONE (built by the architect; ADR-0024 decisions 3 to 5, ADR-0026)
Verify: lint ✅ · typecheck ✅ · tests 993/0 · build ✅
Files: created `server/src/greeting.ts`, `server/src/diagnostics.ts`, `integrate/src/presets.ts`, tests
`server/test/{greeting,diagnostics}.test.ts`, `core/test/error-reasons.test.ts`, `integrate/test/presets.test.ts`,
`client/test/identity.test.ts` additions, guide `docs/guides/agent-greetings-and-style.md`, changeset; modified
core errors and http/protocol schemas, provider-http, sensitive key prefixes, server config/prompt/session/identity/
turn handlers, client snapshot and identity probe, react hook, generated chat box template, Gemini adapter.

What I did:

- `business` profile and `agent.description` / `agent.style` (personality, response length, depth, name usage,
  follow-ups). Style maps to fixed prompt lines; the safety section is still appended by code after them.
- Deterministic greetings on the server: templates per state (guest, member, returning) and per route id;
  placeholders `{name}`, `{business}`, `{agent}`, `{source.field}` (only fields a source lists in `greeting`,
  loaded through the normal projection pipeline and its sign-in check). A template with a missing value is
  skipped. `business.sensitive` disables source placeholders. No model call.
- Starters filtered by `when.auth`, `when.routes` and `when.requires` capability ids; max 4.
- Greeting returned in `ClientConfig.greeting` (session) and `GET /identity?path=` (redacted path).
- `ErrorPayload.reason` with `ERROR_REASONS`; customer text per reason; provider bodies never reach clients.
  Development-only diagnostic log line with scrubbed, 200-char body and a suggested action.
- Client `snapshot.greeting`, `newConversation()`; chat box shows server greeting/starters, probes identity on
  open, notes account changes, New conversation button.
- Presets as data (general, ecommerce, education, admissions, saas, logistics, support, custom); they fill style,
  templates, starter candidates and suggested categories, never enable sources or tools.

Deviations: ADR-0026 decision 3 ships as the dev log line only; `.speeq/last-errors.json` is dropped (the doctor
reads no runtime file). The invalid-key customer message is now the generic "not available" sentence.
Decisions: "returning" is only computed when returning templates exist (saves a store read).
Risks: a greeting with `{source.field}` runs that source on every identity probe; probes are throttled (5 s) and
rate limited, and only fields listed in `greeting` qualify.
Open questions: none

Review (architect): security files read — errors, provider-http, sensitive, diagnostics, greeting, prompt,
handlers. Verdict ACCEPT.

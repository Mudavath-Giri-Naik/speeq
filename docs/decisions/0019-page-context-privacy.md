# ADR-0019 — Page context is declared and allow-listed, not scraped

Status: Proposed (owner confirms in Phase 2 plan section 9). Open questions marked below.

## Context

Today the client always sends `path`, `title` and free-form `data` from `getContext` and
`useSpeeqContext` (`client/src/context.ts`, `react/src/context-registry.ts`). The server puts it in the
prompt (2000 chars, `agent/prompt.ts:79`) and **stores it raw** with the user message event
(`handler/turn.ts:84`, also in `session.started`, `handler/session.ts:55`). Query strings can hold tokens, emails and reset codes. Context is attacker
influenced (page text, URLs) and is a privacy surface the developer may not realise exists.

## Decision

1. **Declared, never scraped.** Context comes only from developer code: `path`, `title`, and named
   slots set through `useSpeeqContext(key, value)`. No DOM reading, no screenshots, no text extraction.
2. **Server allow-list.** `createSpeeq({ context: { allow: [...keys], maxBytes } })`. Keys not on the list
   are dropped and counted in the audit record. Default for new integrations: allow-list empty, so only
   `path` and `title` are accepted; `data` is empty until keys are allowed. This changes behaviour for
   current integrations that rely on free-form `data` (owner confirms; the demo `questionId` key is the
   migration example). Existing configs without a `context` block keep today's behaviour for one minor
   version with a one-time console warning, then default to the allow-list.
3. **Screening.** Values under keys whose names look sensitive, or values that look like secrets or
   personal data in the cheap deterministic cases (JWT shape, long hex or base64 tokens, card-number
   shape, email in a value not declared as such), are dropped. Query parameters named like secrets (and
   `token`, `code`, `key`, `session`, `auth`, `email`) are redacted from `path` on the client **and**
   again on the server. The name list is shared from one module in `core` so the compiler's list and the
   runtime's cannot drift (open question: move `isSensitiveName` out of `@speeq/compiler`; the runtime
   may not import it).
4. **Untrusted in the prompt.** Context is rendered in a delimited block with the same neutralising used
   for tool results; instructions inside it are data.
5. **Storage policy.** The conversation store keeps context **keys and size, not values**, by default
   (`context.store: "keys" | "full" | "none"`, default `keys`). `full` is an explicit opt-in. Open question:
   whether the audit page and any consumer need values; check the demo audit page and `audit` handlers
   before fixing the default (plan open question 3).
6. **Telemetry.** Never. The forbidden-fields test is extended with `context` and every context key name.
7. **Per-turn.** Context is read when a turn starts, not streamed continuously.

## Alternatives rejected

- Automatic page text summarisation: privacy and injection surface, non-deterministic.
- Client-only redaction: the server must not trust the client to have done it.
- Storing nothing by default: loses useful audit of what the agent saw; keys-only is the middle.

## Consequences

Less context by default, so answers about "this page" depend on the developer declaring slots; the CLI
doctor will list undeclared-but-useful slots later (Phase 3 idea, not now).

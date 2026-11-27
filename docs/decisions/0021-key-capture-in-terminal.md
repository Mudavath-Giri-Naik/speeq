# ADR-0021: Key capture in the terminal (`speeq connect`)

Status: Accepted

## Context

Until now speeq wrote only variable names into `.env.local` and never saw a key (ADR for task 021).
Developers still had to find a model id, guess which ones their key could use, and get the file right
by hand. In practice a wrong or retired model id and a config that used another provider produced the
same generic "the AI provider had a problem" message, and the developer could not tell why.

## Decision

`speeq connect` (also offered at the end of `init`) asks for the provider key in the terminal, checks it,
tests the models, and saves the key and the chosen model in `.env.local`. This is the one place speeq
handles a secret, and only because the developer pasted it into the prompt.

Rules, all enforced by tests:

1. **Hidden input.** The key is read with a masked prompt. It is never printed, logged, put in a URL,
   returned in `--json` output, written to an error message or kept in any file but `.env.local`.
2. **Only the provider's own host.** The key is sent in a request header to the provider's documented
   API (Groq, Gemini, OpenRouter) or to the base URL the developer typed (https, or http for localhost,
   no credentials, no redirects). Nothing goes to speeq or to a third party.
3. **Scrubbed messages.** Provider error text is shortened and has the key replaced before it is shown.
4. **Tiny, bounded tests.** Each model gets one message of a few tokens, at most 25 models, four at a
   time, 15 seconds each. Non-chat models are skipped. OpenRouter tests only `:free` models. For a
   custom server the developer is asked first because it may use paid quota. This keeps the zero-cost
   rule: speeq never starts paid usage on its own.
5. **Plain values only.** Written values may contain only letters, digits and `_ . - : / + = @ ~`, so a
   pasted value can never add a line or need quoting. Existing non-empty values are replaced only after
   a yes. Empty duplicates are all filled.
6. **Local file only.** `.env.local` is written, never `.env.example` or `.speeq/setup.json`; `.gitignore`
   is made to cover `.env*.local` first.
7. **Not journaled.** `speeq rollback` does not remove a saved key: a backup copy of a secret would be a
   second place for it to leak. Delete the line to remove it.
8. **Needs a terminal.** In CI or with `--json` the command exits with a usage error and calls nothing.
9. **Config provider.** If `speeq.config.ts` uses a different provider than the one the key is for, the
   command offers to switch the `llm` call and its import (nothing else), keeps a copy of the file in
   `.speeq/backups`, and prints the snippet instead when the file has an unexpected shape.

## Consequences

- The developer sees which models work with their key today instead of guessing an id.
- The "speeq never touches keys" statement in the docs is now "unless you paste a key".
- `integrate` stays pure (the env and config rewriting are plain functions); all network code is in the
  CLI, behind an injectable `fetch`, so tests run with no network.

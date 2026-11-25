---

title: Telemetry fields
description: The exact anonymous data speeq can send to a dashboard you run.
---

# Telemetry fields

Telemetry is **off** unless you set `SPEEQ_PLATFORM_URL` (or `telemetry.endpoint`, or your own `telemetry.transport`). Set `SPEEQ_TELEMETRY=0` or `telemetry.enabled: false` to turn it off completely. For the plain-language version, read [Privacy and telemetry](/docs/concepts/privacy).

## What a batch contains

| Record         | Fields                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Batch          | `schemaVersion` (1), `instanceId` (a random ID), optional public `projectKey` (like `pk_xxxxxxxx`), `sentAt`, and 1 to 50 `events`.                                                                                      |
| `sdk.init`     | The installed `@speeq/server` version, the runtime (`node`, `bun`, `deno`, `edge`, or `unknown`), the framework (`nextjs` or `unknown`), and which features are on.                                                      |
| Features       | Yes or no for `navigation`, `tools`, `knowledge`, `audit`, and `confirmations`. Also the store and model adapter kinds, and the number of languages.                                                                     |
| `usage.rollup` | Counts of `sessions`, `turns`, `voiceTurns`, `textTurns`, `toolCalls` (built-in or custom), `navigations`, `knowledgeSearches`, `confirmations` (requested, approved, rejected), `languages`, and response-time buckets. |
| `error.rollup` | A map from error code to count.                                                                                                                                                                                          |

Response times are put into buckets: up to 250, 500, 1000, 2000, 4000, 8000 and 16000 milliseconds, then a last bucket for slower ones. Counters stop at one billion.

## What is never sent

Conversation text, audio, prompts, tool names, arguments and results, knowledge content, route names, URLs, user or session IDs, model IDs, IP addresses, request headers, credentials, raw errors, and stack traces.

## How it is sent

- The first send happens after the first turn. Later sends wait at least `flushIntervalMs` (60 seconds by default).
- A send is a `POST` of JSON to `<endpoint>/api/v1/ingest`. It sends no cookies, follows no redirects, and uses one header: `content-type`.
- Each batch is checked against a strict format first. A bad batch is dropped.
- If a send fails, the batch is dropped. A restart drops unsent counts.

## What the dashboard checks

The ingest endpoint accepts JSON only, up to 65,536 bytes. Other methods get 405, other content types get 415, and large bodies get 413. A broken batch gets 400.

- `sentAt` may be at most 24 hours old, or 5 minutes ahead.
- Event times may be at most 7 days old, or 5 minutes ahead.
- Voice turns plus text turns must equal turns.
- Each instance may send 10 batches per UTC minute, and the whole system 1,200. More than that gets 429 with `retry-after`.

Accepted batches always get the same `202` answer, whether the project key is real, unknown, revoked, or missing.

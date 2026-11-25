# Server telemetry

The server keeps anonymous adoption counters in memory. To send them to your platform, set `telemetry.endpoint` or `SPEEQ_PLATFORM_URL` to its base URL. A custom `telemetry.transport` takes precedence. With neither destination configured, telemetry is inactive. Set `telemetry.enabled: false` or `SPEEQ_TELEMETRY=0` to disable collection even with a destination.

## Batch schema

| Record         | Fields sent                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Batch          | `schemaVersion` (1), `instanceId` (random UUID per collector), optional public `projectKey` matching `^pk_[A-Za-z0-9]{8,64}$`, ISO timestamp `sentAt`, and `events` (schema limit 1–50).                                                                                                                                                    |
| `sdk.init`     | `type`, `ts`, `sdkVersions` containing the installed `@speeq/server` version, `runtime` name (node, bun, deno, edge or unknown) and sanitized version, `framework` (nextjs or unknown), and `features`. Sent on the first attempt.                                                                                                          |
| `features`     | Boolean `navigation`, `tools`, `knowledge`, `audit`, and `confirmations` (write tools present). Also `store` and `llm` adapter kinds and configured `languageCount`. Invalid adapter slugs become `custom`.                                                                                                                                 |
| `usage.rollup` | `type`, `ts`, `periodStart`, `periodEnd`, and `counters` for `sessions`, `turns`, `voiceTurns`, `textTurns`, `toolCalls` (builtin/custom), `navigations`, `knowledgeSearches`, `confirmations` (requested/approved/rejected), `languages` (up to 20 valid tags, each at most 20 characters), and `latencyMs` (total/firstToken histograms). |
| `error.rollup` | `type`, `ts`, `periodStart`, `periodEnd`, and `errors`, a map from stable error codes to counts.                                                                                                                                                                                                                                            |

All timestamps use ISO UTC. Each counter saturates at one billion. Latency buckets have inclusive upper bounds of 250, 500, 1000, 2000, 4000, 8000 and 16000 milliseconds, followed by an overflow bucket. First-token samples require an observed first token. Turn counts, languages and latency samples count user messages. A confirmation resumes an existing turn, and its outcome, tools, navigation and errors still contribute to their respective counters.

## Delivery and privacy

The first recorded activity is eligible to send at the end of a turn. Later sends are at least `telemetry.flushIntervalMs` apart (default 60000 milliseconds). Zero permits a send whenever counters are pending. Each attempt validates a snapshot against the strict batch schema and drops invalid batches. Activity during a send accumulates for the next eligible flush. Failed batches are discarded. A process restart discards unsent counts.

The default transport POSTs JSON to `<endpoint>/api/v1/ingest` with credentials omitted, caching disabled and redirects rejected. The only application-supplied header is `content-type: application/json`. Custom transports receive the same validated batch and an abort signal. Delivery uses `waitUntil` when available, otherwise the stream tail waits up to 1500 milliseconds after the final turn event.

Payloads exclude conversation text, audio, prompts, tool names, arguments and results, knowledge content, route names, URLs, user and session IDs, model IDs, IP addresses, request headers, credentials, raw errors and stack traces.

---

title: Server settings
description: Every option you can pass to createSpeeq, with defaults, in plain words.
---

# Server settings

You pass these to `createSpeeq(config)`. It returns an object with `handler(request)` and `purgeExpired()`.

## Main settings

| Setting          | Default                               | What it does                                                                       |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------------------- |
| `agent`          | required                              | The assistant's name and instructions. See below.                                  |
| `llm`            | required                              | The model provider.                                                                |
| `store`          | required                              | Where conversations are saved.                                                     |
| `secret`         | random in development                 | Signs session tokens. **Required in production.**                                  |
| `resolveUser`    | none                                  | A function that returns the signed-in user, or `null`.                             |
| `allowAnonymous` | `true` with no resolver, else `false` | Whether visitors who are not signed in may use it.                                 |
| `routes`         | `[]`                                  | Pages the assistant may open.                                                      |
| `tools`          | `[]`                                  | Actions the assistant may run.                                                     |
| `knowledge`      | `[]`                                  | Searchable content.                                                                |
| `uiActions`      | `[]`                                  | Page actions the assistant may ask for. See [UI actions](/docs/guides/ui-actions). |
| `allowedOrigins` | `[]`                                  | Extra websites that may call the handler (exact origins).                          |
| `audit`          | `{}`                                  | Audit access, redaction and retention. See below.                                  |
| `guardrails`     | defaults below                        | Size, time, and rate limits.                                                       |
| `telemetry`      | defaults below                        | Anonymous counters.                                                                |
| `updateCheck`    | `true`                                | Set `false` to turn off the development update note.                               |
| `projectKey`     | none                                  | Public key that ties counters to a dashboard project.                              |
| `waitUntil`      | none                                  | Lets background work finish after the answer. In Next.js, use `after`.             |
| `logger`         | console                               | An object with `error` and `warn` methods.                                         |

## agent

| Setting                | Default                   | What it does                                      |
| ---------------------- | ------------------------- | ------------------------------------------------- |
| `name`, `instructions` | required                  | Display name, and what the assistant should do.   |
| `languages`            | `en-IN`, `te-IN`, `hi-IN` | Allowed language tags.                            |
| `defaultLanguage`      | first language            | Must be in the list.                              |
| `maxSteps`             | `5`                       | Most model calls per turn (between 1 and 12).     |
| `historyTurns`         | `8`                       | How many earlier visitor messages the model sees. |
| `temperature`          | not set                   | Passed to the model provider.                     |

## audit

| Setting         | Default | What it does                                                                         |
| --------------- | ------- | ------------------------------------------------------------------------------------ |
| `authorize`     | none    | Checks your admin. Without it, audit routes return 404. Must return `true` to allow. |
| `redact`        | none    | Change or drop events before saving (return `null` to drop).                         |
| `retentionDays` | not set | Expire sessions after this many days without activity.                               |

## guardrails

| Setting                       | Default                           |
| ----------------------------- | --------------------------------- |
| `maxToolOutputChars`          | `8000`                            |
| `toolTimeoutMs`               | `8000`                            |
| `maxRequestBytes`             | `32768`                           |
| `sessionTtlSeconds`           | `43200` (12 hours)                |
| `rateLimit`                   | on. Set to `false` to turn off.   |
| `rateLimit.turnsPerMinute`    | `20`                              |
| `rateLimit.sessionsPerMinute` | `10`                              |
| `uiActionsPerTurn`            | `5`                               |
| `uiActionsPerSession`         | `30` (counted over recent events) |

Rate limits count inside one running server.

## telemetry

| Setting           | Default                        | What it does                              |
| ----------------- | ------------------------------ | ----------------------------------------- |
| `enabled`         | `true` if a destination exists | `false` turns off counting.               |
| `endpoint`        | `SPEEQ_PLATFORM_URL`           | Base address of your dashboard.           |
| `transport`       | HTTP when an endpoint is set   | Your own sender. It wins over `endpoint`. |
| `flushIntervalMs` | `60000`                        | Time between sends.                       |

## See also

[Tools](/docs/guides/tools) · [Telemetry fields](/docs/reference/telemetry) · [Environment variables](/docs/reference/environment)

## Speech

Register recognizers under `speech.stt` and synthesizers under `speech.tts`. The respective `speech.routing` maps associate language tags with ordered provider IDs. Both remote and paid access default off. Defaults for `speech.limits` are 5,000,000 upload bytes, 60 seconds, 1,000 synthesis characters, 30 transcriptions and 60 syntheses per minute, and a 15,000 ms provider timeout. Voice listing uses its own rate bucket. See [Voice providers](/docs/guides/voice-providers).

Pass `vocabulary` to merge explicit domain terms with route titles and tool names. Set `speech.clarifyBelow` between zero and one to require clarification for low-confidence voice writes. Use `createSpeechConfig` for an explicit provisional profile. [Domain vocabulary](/docs/guides/vocabulary)

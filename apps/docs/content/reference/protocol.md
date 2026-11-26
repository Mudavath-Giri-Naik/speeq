---

title: HTTP protocol
description: The paths and messages between the browser and the speeq handler.
---

# HTTP protocol

You usually do not call these by hand. The client does it for you. This page helps if you build your own client or debug with `curl`.

Paths are relative to where you mount the handler (for example `/api/speeq`). Bodies are JSON. Turn and confirm requests also need the header `Authorization: Bearer <sessionToken>`.

## Endpoints

| Method and path             | You send                                                                                           | You get                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `GET /health`               | nothing                                                                                            | `ok`, `protocolVersion`, `sdkVersion`                  |
| `POST /session`             | optional `language` and `context`                                                                  | `sessionId`, `sessionToken`, `expiresAt`, and `config` |
| `POST /session/:id/turn`    | `text` (1 to 2,000 characters), `language`, optional `context` and `inputMode` (`text` or `voice`) | a stream of events                                     |
| `POST /session/:id/confirm` | `confirmationId`, `approved` (true or false)                                                       | a stream that continues the turn                       |
| `GET /audit/sessions`       | optional `userId`, `from`, `to`, `limit`, `cursor`                                                 | `sessions`, `nextCursor`                               |
| `GET /audit/sessions/:id`   | admin credentials                                                                                  | `session`, `events`                                    |
| `OPTIONS`                   | origin check                                                                                       | `204` when allowed                                     |

Page context is `{ path, title?, data? }`. If something fails **before** the stream starts, you get `{ "error": { "code", "message", "retryable", "retryAfterMs"? } }`. See [Error codes](/docs/reference/errors).

## Stream events

A turn answers with Server-Sent Events. Each event carries JSON with `type`, `protocolVersion` (1), and `turnId`, plus:

| Event                   | Extra fields                                               |
| ----------------------- | ---------------------------------------------------------- |
| `turn.started`          | `sessionId`, `language`                                    |
| `assistant.delta`       | `text`                                                     |
| `assistant.message`     | `messageId`, `text`                                        |
| `tool.started`          | `callId`, `name`, `kind` (`builtin` or `custom`)           |
| `tool.finished`         | `callId`, `name`, `ok`, `durationMs`, optional `errorCode` |
| `navigate`              | `routeId`, `href`, `params`                                |
| `confirmation.required` | `confirmationId`, `toolName`, `summary`, `args`            |
| `error`                 | `code`, `message`, `retryable`, optional `retryAfterMs`    |
| `turn.finished`         | `reason`, `latencyMs`, optional `firstTokenMs` and `usage` |

`reason` is one of `completed`, `max_steps`, `confirmation_required`, `error`, or `aborted`. On `confirmation_required`, show the pending choice, then call the confirm endpoint.

## Try it with curl

```bash
curl -s http://localhost:3000/api/speeq/health
curl -s -X POST http://localhost:3000/api/speeq/session -H 'Content-Type: application/json' -d '{}'
```

## Session speech routes

When speech is configured, session creation includes `config.speech` with `stt` and `tts` availability. Each speech route requires the session bearer token.

| Method | Session-relative path                              | Payload and response                                                                                                                                                       |
| ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `speech/transcribe?language=te-IN&utteranceId=abc` | Raw audio bytes with their MIME type. Returns final text and optional language, confidence and timing. Silent WAV returns empty text and `silent: true`.                   |
| POST   | `speech/synthesize`                                | JSON text and language, optional voiceId, rate, pitch, volume, style and format. Returns provider audio with its content type. `X-Speeq-Ignored` lists unapplied controls. |
| GET    | `speech/voices?language=te-IN`                     | Returns `{ voices: [...] }` with voice metadata.                                                                                                                           |

Transcription replay by utterance ID is per session and per server instance, for two minutes and up to 500 entries. Provider failures can advance to the next approved provider. Invalid input stops the request.

A turn can include optional `inputLanguage` and `transcript` (raw text, confidence, provider, corrected flag and ambiguous spans). The existing `language` is the reply language. The optional `turn.started.inputLanguage` identifies the speech language. Transcription responses can include `raw`, `corrected` and `ambiguous`. These fields only tighten write restrictions.

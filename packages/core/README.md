# @speeq/core

The shared contract of [speeq](../../README.md). It holds:

- **Zod schemas and types** for the HTTP + SSE protocol (`ProtocolEventSchema`, `TurnRequestSchema`, …),
  the audit log (`ConversationEventSchema`, `SessionSummarySchema`) and telemetry (`TelemetryBatchSchema`).
- **Interfaces** for every swappable part: `LLMProvider`, `ConversationStore`, `KnowledgeSource`,
  `SpeechInput`, `SpeechOutput`, `TelemetryTransport`.
- **`SpeeqError`** with stable codes (`RATE_LIMITED`, `TOOL_TIMEOUT`, …) and `toPublicError`, which
  never leaks raw messages.
- **Utilities:** `createId`, `SentenceChunker` (streaming TTS), `SseParser` / `encodeSse`,
  `safeJsonStringify`, `truncate`, `redactKeys` / `redactText`, `TypedEmitter`, `combineSignals`.

You normally don't install this directly. `@speeq/server`, `@speeq/client` and the adapters use
it. Install it to write your own adapter:

```bash
pnpm add @speeq/core@next zod
```

## Entry points

| Import               | Contents                             | Needs zod  |
| -------------------- | ------------------------------------ | ---------- |
| `@speeq/core`        | everything                           | yes (peer) |
| `@speeq/core/errors` | `SpeeqError`, codes, `toPublicError` | no         |
| `@speeq/core/utils`  | utilities above                      | no         |

## Example: a custom LLM provider

```ts
import { type LLMProvider, SpeeqError } from "@speeq/core";

export const echoProvider: LLMProvider = {
  kind: "echo",
  model: "echo-1",
  async *stream({ messages }) {
    const last = messages.at(-1);
    if (!last) throw new SpeeqError("INVALID_INPUT");
    yield { type: "text-delta", text: `You said: ${"content" in last ? last.content : ""}` };
    yield { type: "finish", reason: "stop" };
  },
};
```

See [`docs/reference/protocol.md`](../../docs/reference/protocol.md) for the wire format.

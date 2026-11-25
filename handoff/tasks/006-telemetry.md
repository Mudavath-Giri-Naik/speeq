# TASK 006 — Server telemetry collector and HTTP transport

Branch: task/006-telemetry (already created from `main`; it contains this brief and the privacy test. Check it out, do not create another).

## 1. Read first

- `AGENTS.md`, `PLAN.md` §3 (decision 8, ADR-0004 summary) and the telemetry note in §5.
- `packages/core/src/schemas/telemetry.ts` (the wire contract; strict schemas), `packages/core/src/interfaces/telemetry.ts` (`TelemetryTransport`), `packages/core/src/constants.ts` (`LATENCY_BUCKETS_MS`).
- `packages/server/src/telemetry/{index,sink}.ts` (the no-op placeholder you replace), `packages/server/src/config.ts` (`TelemetryConfig`), `packages/server/src/runtime.ts`, `packages/server/src/handler/turn.ts` (lines ~236–320: where `turn()` and `flushIfDue()` are called), `packages/server/src/index.ts`.
- **`packages/server/test/telemetry-privacy.test.ts` — the acceptance test. Written by the architect. It is currently red (7 failing). Make it pass UNCHANGED.** Never edit, skip, weaken or delete a case. If you think a case is wrong, stop and explain in the report instead.

## 2. Goal

`createTelemetry(config)` returns a real collector behind the existing `TelemetrySink` interface: it
accumulates anonymous counters in memory, builds schema-valid `TelemetryBatch`es, and sends them
through a transport (default: `fetch` POST to `<endpoint>/api/v1/ingest`) without ever delaying a
turn, throwing into host code, or sending anything that is not in the schema.

## 3. Decisions already made (do NOT change or re-decide)

- **Files:** `telemetry/collector.ts` (counters + batching), `telemetry/http-transport.ts` (default transport), `telemetry/runtime-info.ts` (runtime/framework/SDK versions), `telemetry/index.ts` (`createTelemetry`). Keep `sink.ts` unchanged.
- **Enabled when all are true:** `config.telemetry?.enabled !== false`, `process.env.SPEEQ_TELEMETRY !== "0"` (read defensively: `typeof process !== "undefined"`), and a destination exists: `config.telemetry?.transport` OR an endpoint (`config.telemetry?.endpoint` ?? `process.env.SPEEQ_PLATFORM_URL`, trimmed, non-empty). Otherwise return `noopTelemetry`. A custom `transport` takes precedence over the endpoint. Trim trailing slashes from the endpoint.
- **Nothing is ever sent without validating first:** build the batch, run `TelemetryBatchSchema.safeParse`; if it fails, **drop the batch silently** (log once via `config.logger.warn` with a generic message, never include the payload). This is the last line of defence; the collector must also be correct by construction.
- **Counters (memory only, reset after each send attempt, success or failure):** exactly the fields of `UsageRollupEvent.counters` plus an error-code map for `ErrorRollupEvent`. Rules:
  - `turn(info)`: `turns++`; `voiceTurns++` if `inputMode === "voice"` else `textTurns++`; `languages[tag]++` **only if the tag is valid per `LanguageSchema` and fewer than 20 distinct tags are tracked** (otherwise ignore the language, still count the turn); total latency histogram gets `latencyMs`; first-token histogram gets `firstTokenMs` only when defined.
  - Histogram bucket for value `v`: first index `i` where `v <= LATENCY_BUCKETS_MS[i]`, else the overflow slot (last index). Negative or non-finite values are clamped to 0 / the overflow slot respectively. Never throw.
  - `toolCall(kind)`: `kind === "builtin"` → `toolCalls.builtin++`, otherwise `custom++` (check `ToolKind` in core; map any non-builtin value to custom). Never record tool names.
  - `navigation()`, `knowledgeSearch()`, `session()`, `confirmation(outcome)` increment the matching counter. `error(code)` increments `errors[code]`.
  - All counters saturate at 1,000,000,000 (schema max). No negative values.
- **Never send an empty rollup:** omit `usage.rollup` when every counter is zero; omit `error.rollup` when no errors. If there is nothing to send and `sdk.init` was already sent, `flushIfDue()` returns `null`.
- **`sdk.init`:** sent once per collector (instance), in the first batch that is sent, before any rollup. Content: `sdkVersions` = `{ "@speeq/server": SDK_VERSION }` only (do not probe other packages); `runtime` from `process.versions` (`node` → `{name:"node",version}`, `Bun`/`Deno` globals → bun/deno, `EdgeRuntime` global → `{name:"edge", version:""}`, else `{name:"unknown", version:""}`; version must match the schema regex, strip anything else); `framework`: `"nextjs"` if `process.env.NEXT_RUNTIME` is set, else `"unknown"`; `features` from the resolved config: `navigation` = routes present, `tools` = custom tools present, `knowledge` = knowledge sources present, `audit` = audit enabled (use the same truthiness the runtime uses for `features.audit` in the client config — see `handler/session.ts`), `confirmations` = any custom tool with `risk: "write"`, `store` = `store.kind`, `llm` = `llm.kind`, `languageCount` = number of configured languages. `store`/`llm` kinds must be sanitized to the `slug` pattern; if they do not match, send `"custom"`.
- **Batching:** `instanceId` = `crypto.randomUUID()` once per collector. `schemaVersion` = `TELEMETRY_SCHEMA_VERSION`. `projectKey` = `config.projectKey` only if it matches `/^pk_[A-Za-z0-9]{8,64}$/`, else omitted. `sentAt`/`ts` = now (ISO). `periodStart` = time of the first recorded counter since the last send (or collector creation); `periodEnd` = now.
- **`flushIfDue()`:** returns `null` if nothing is pending (no unsent `sdk.init` and no counters), or if a send is in flight, or if `now - lastSendStartedAt < flushIntervalMs` **and** nothing forces it. `flushIntervalMs` default 60,000; `0` means "always due when something is pending". The very first send (the `sdk.init`) is due as soon as any counter is recorded (do not wait a full interval). Otherwise returns a promise that: snapshots + resets counters synchronously (so concurrent turns never double count), validates, calls the transport with an `AbortSignal` that aborts after **1500 ms** (`AbortSignal.timeout` or a manual controller), and **always resolves** (catch everything, including a transport that never settles: race against the timeout). On failure the data is **dropped, not retried** (privacy + bounded memory); `sdk.init` is considered sent once attempted.
- **Never throws into host code:** every `TelemetrySink` method is wrapped in try/catch and is synchronous and O(1).
- **Default HTTP transport:** `fetch(`${endpoint}/api/v1/ingest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(batch), signal, credentials: "omit", cache: "no-store", redirect: "error", keepalive: true })`. **No other headers** (no user-agent override, no auth, no cookies). Treat non-2xx as a failed send (no retry). Use `globalThis.fetch` resolved at send time (the privacy test stubs it).
- **Custom transport** receives the same validated `TelemetryBatch` and an `{ signal }`.
- **Do not log** batches, endpoints with credentials, or errors from the transport beyond one generic `warn` per instance ("telemetry send failed") — and never include `error.message` (it could carry URLs).
- The dependency direction rule still applies: `server` may import `@speeq/core` only (plus its own files).
- Do not change `packages/core`, `packages/client`, `packages/react`, `apps/**`, or the privacy test.

## 4. Scope

Create: `packages/server/src/telemetry/{collector,http-transport,runtime-info}.ts`, `packages/server/test/telemetry-collector.test.ts` (your own unit tests, §7), `docs/reference/telemetry.md` (user-facing reference: exactly what is sent, what is never sent, how to disable, the schema table; keep it in sync with `core/src/schemas/telemetry.ts`).

Modify: `packages/server/src/telemetry/index.ts`, `packages/server/README.md` (short "Telemetry" section linking the reference), `handoff/reports/006-telemetry.md` (create).

Do NOT touch: `packages/server/test/telemetry-privacy.test.ts`, `packages/core/**`, other packages, `apps/**`, `.env.example`, `handoff/INDEX.md`.

## 5. Requirements

1. `telemetry-privacy.test.ts` passes unchanged (all 14 cases).
2. Disabled/no-destination configurations return `noopTelemetry` (assert identity in your unit test) and perform no I/O.
3. A turn's response is never delayed by telemetry: with `waitUntil` the flush runs in the background; without it the existing `beforeClose` path awaits at most the 1.5 s timeout.
4. A transport failure, rejection, thrown error, or non-2xx response never affects the conversation, never retries, and never leaks the error message into logs.
5. Concurrent turns while a send is in flight do not lose or double count events.
6. All counters and histograms obey the rules in §3; out-of-range inputs cannot produce a schema-invalid batch.

## 6. Contracts

```ts
// telemetry/index.ts (unchanged signature)
export function createTelemetry<TUser extends AgentUser>(config: SpeeqConfig<TUser>): TelemetrySink;

// telemetry/collector.ts
export interface CollectorOptions {
  transport: TelemetryTransport;
  projectKey?: string;
  flushIntervalMs: number;
  features: TelemetryFeatures;
  warn: (message: string) => void;
  now?: () => number; // injectable clock for tests
}
export function createCollector(options: CollectorOptions): TelemetrySink;

// telemetry/http-transport.ts
export function createHttpTransport(endpoint: string): TelemetryTransport;
```

## 7. Tests required (`packages/server/test/telemetry-collector.test.ts`, in addition to the architect's file)

- Histogram bucketing at each boundary (250 → slot 0, 251 → slot 1, 16000 → slot 6, 16001 → slot 7), NaN, negative, Infinity.
- `languages` capped at 20 distinct tags; an invalid tag is ignored but the turn still counts.
- Counter saturation at 1,000,000,000.
- Rollups omitted when empty; `sdk.init` sent exactly once even across several flushes and after a failed send.
- Counters reset after a send even when the transport throws (no double count next time).
- `flushIfDue()` returns `null` while a send is in flight, and respects the injected clock + `flushIntervalMs`.
- Invalid `projectKey` is omitted; valid one is sent.
- Store/LLM kind not matching the slug pattern becomes `"custom"`.
- Schema failure path: force an invalid feature value and assert the batch is dropped, transport not called, one generic warn.
- Default transport: non-2xx treated as failure; endpoint trailing slash trimmed; request init has no extra headers.

## 8. Acceptance

- `scripts/verify.sh` passes with no overrides (run `pnpm lint:fix` for formatting).
- Bundle sanity: `pnpm --filter @speeq/server build` succeeds and the built `dist` contains no reference to `process.env` access that throws in edge runtimes (all env reads are guarded).
- `git diff --stat` shows only §4 files. No secrets. `.env.example` not staged.

## 9. Finish

Commit on the branch (Conventional Commits, no attribution lines of any kind, no Co-Authored-By).
Write `handoff/reports/006-telemetry.md` from `handoff/REPORT_TEMPLATE.md` and print it. Do not
merge to main. Do not push. Do not edit `handoff/INDEX.md`.

## Amendment A (architect decision, answers the blocked report)

A confirmation resume continues the same user turn, so it must **not** be counted as a new turn
(`turns`, `textTurns`/`voiceTurns`, `languages` and both latency histograms count user messages
only). Scope is extended to **`packages/server/src/handler/turn.ts`**, limited to:

- Add an optional flag to `streamTurn` (for example `countTurn: boolean`, default `true`); `handleConfirm` passes `false`.
- Call `rt.telemetry.turn(...)` only when the flag is true. Everything else stays as is: confirmation outcomes, tool calls, navigation and errors raised during a resume are still recorded.
- The `TelemetrySink` interface and the collector stay unchanged: the collector counts every `turn()` call it receives.
- No other changes in `turn.ts`. Existing server tests must keep passing.

Also fix the four type errors in your draft collector tests before finishing.

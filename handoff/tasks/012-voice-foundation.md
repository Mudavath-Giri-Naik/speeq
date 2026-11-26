# TASK 012 — Voice foundation: pluggable speech providers, server audio, benchmark harness

Branch: task/012-voice-foundation (create it from latest main)

## 1. Read first

- `docs/decisions/0011-voice-architecture.md` (all of it: this brief implements D1-D5, D7, D12-D15)
- `docs/maintainers/voice-research.md`
- `AGENTS.md` (dependency rules, conventions, commit rules, zero-cost rule)
- `packages/core/src/interfaces/speech.ts`, `packages/core/src/errors.ts`, `packages/core/src/schemas/http.ts`
- `packages/client/src/{client.ts,mic-monitor.ts,speech-queue.ts,web-speech-input.ts,web-speech-output.ts,types.ts}`
- `packages/server/src/{config.ts,define.ts,handler/index.ts,handler/http.ts,handler/turn.ts,security/}`
- `packages/adapters/llm-openai-compatible/` (copy its package layout), `packages/testing/src/`
- `apps/docs/content/guides/voice.md`

## 2. Goal

Speech becomes pluggable without changing how developers use speeq today. After this task a developer
can configure server-side speech-to-text and text-to-speech providers (Groq Whisper or any
OpenAI-compatible audio API), the browser client can record audio, send it to the developer's own
speeq route, and play synthesized speech sentence by sentence. Everything is policy gated (no silent
paid or remote providers), honest about streaming, and measurable with a benchmark harness. The
browser Web Speech path is unchanged and stays the default.

## 3. Decisions already made (do NOT change or re-decide)

- Follow ADR 0011. In particular: audio goes browser → speeq route → provider; keys never in the
  browser; raw audio is never stored; no audit schema change in this task.
- Reuse `SpeechInput`/`SpeechOutput`. Only **add optional** members. No existing member changes.
- Provider kinds: `self-hosted | remote-free-tier | remote-paid`. Policy defaults: `allowRemote: false`,
  `allowPaid: false`. A provider runs only if listed in `speech.routing` for the language (or in the
  `default` entry) AND policy allows its kind. Fallback never leaves the listed chain.
- Streaming mode of every HTTP provider is `buffered`. Web Speech is `native`.
- Capture format is **PCM**: record with an AudioWorklet (inline Blob module; fall back to
  `ScriptProcessorNode`), resample to 16 kHz mono, encode 16-bit WAV. Do not use `MediaRecorder`.
- No new runtime dependency anywhere. `client` stays dependency free. New package `@speeq/speech`
  depends only on `@speeq/core` (plain `fetch`, like `llm-openai-compatible`).
- Error codes: add `SPEECH_UNAVAILABLE` (HTTP 503, message "Voice is not available right now. You can
  type instead.") and `PAYLOAD_TOO_LARGE` (HTTP 413, message "That audio is too long."). Reuse
  `INVALID_INPUT`, `RATE_LIMITED`, `PROVIDER_ERROR`, `NOT_CONFIGURED`, `UNAUTHENTICATED` as today. Update
  everything that enumerates error codes (schemas, status map, client mapping, tests,
  `apps/docs/content/reference/errors.md`).
- The existing call mode, echo guard, grace pause and mic-level detector keep working with any
  `SpeechInput`. Do not change Web Speech behaviour.

## 4. Scope

Create:

- `packages/core/src/interfaces/speech-provider.ts` (+ export from `index.ts`)
- `packages/core/src/schemas/speech.ts` (+ export)
- `packages/server/src/speech/{router.ts,policy.ts,limits.ts,wav.ts,handlers.ts}`
- `packages/adapters/speech/` (new package `@speeq/speech`, copy `llm-openai-compatible` layout)
- `packages/client/src/{voice-detector.ts,wav.ts,pcm-capture.ts,endpointing.ts,server-speech-input.ts,server-speech-output.ts}`
- `packages/testing/src/fake-speech-provider.ts` (+ export)
- `tools/voice-bench/` (private workspace package `@speeq/voice-bench`, see section 5.8)
- `apps/docs/content/guides/voice-providers.md`
- `.changeset/voice-foundation.md`

Modify: `packages/core/src/{errors.ts,interfaces/speech.ts,index.ts,schemas/*}`,
`packages/server/src/{config.ts,define.ts,handler/index.ts,index.ts}`,
`packages/client/src/{client.ts,types.ts,speech-queue.ts,mic-monitor.ts,index.ts}`,
`packages/react/src/*` (only to pass through new option types), `packages/speeq/` (umbrella: add
`speeq/speech`), `.changeset/config.json` (add `@speeq/speech` to the fixed group),
`scripts/{pack-all.sh,pack-test.sh,check-deps-direction.ts}`, `apps/docs/content/{guides/voice.md,reference/*.md}`,
`apps/docs/content/nav.ts`, `pnpm-workspace.yaml`/`turbo.json` only if needed.

Do NOT touch: `packages/server/src/telemetry/**`, `packages/core/src/schemas/telemetry.ts`,
`packages/core/src/schemas/audit.ts`, the platform app, `apps/docs/lib/assistant/**` (a later task wires
the docs site), `apps/docs/components/**`.

## 5. Requirements

1. **Core contracts** exactly as section 6, exported from `@speeq/core`. Add the optional members to
   `SpeechInput`/`SpeechOutput`/`SpeakOptions` (section 6). JSDoc every export.
2. **HTTP schemas** (`schemas/speech.ts`): query/response/body schemas in section 6, exported with
   inferred types. `language` fields use the existing `LanguageSchema`.
3. **Server config** `speech` block (section 6). Validate at `createSpeeq` time: unknown provider id in
   `routing` → `NOT_CONFIGURED` (fail fast, clear message, no secret in it); duplicate provider ids →
   `NOT_CONFIGURED`. `speech` absent → the three routes answer `NOT_FOUND` and `config.features` is
   unchanged. When present, `ClientConfig` gains optional `speech: { stt: boolean; tts: boolean }`
   (additive; update the schema and `PROTOCOL` docs).
4. **Policy gate** (`speech/policy.ts`, pure function, exhaustively tested): given providers, routing,
   policy and a language, return the ordered list of usable provider ids and, for each skipped one, a
   reason (`not-listed | remote-disallowed | paid-disallowed`). Language lookup: exact tag, then base
   language (`te` for `te-IN`), then `default`. An empty result → `SPEECH_UNAVAILABLE`.
5. **Routes** (extend the route table in `handler/index.ts`; same auth, CORS, rate limiting and
   error mapping as `turn`):
   - `POST /session/:id/speech/transcribe?language=<tag>&utteranceId=<id>` body = raw audio bytes,
     `Content-Type: audio/wav` (other types: pass through to the provider unchanged).
   - `POST /session/:id/speech/synthesize` JSON body `SynthesizeRequest`; response is the audio stream
     with the provider's `Content-Type` and header `X-Speeq-Ignored: rate,pitch` when parameters were
     ignored.
   - `GET /session/:id/speech/voices?language=<tag>` → `VoicesResponse`.
   - Enforce limits (section 6) **while reading** the body (never buffer past the cap), reject early on
     `Content-Length`. Separate rate-limit buckets per route using the existing limiter mechanism.
   - For `audio/wav` (PCM16): parse the header (`wav.ts`). Duration < 200 ms → `INVALID_INPUT`.
     Duration > `maxAudioSeconds` → `PAYLOAD_TOO_LARGE`. RMS below `0.003` → respond 200 with
     `{ text: "", silent: true }` **without calling any provider** (saves free-tier quota and prevents
     Whisper hallucinating text from silence).
   - Try providers in policy order. `RATE_LIMITED` or `PROVIDER_ERROR` or timeout → next provider.
     `INVALID_INPUT` from a provider → stop (not retryable). All failed → `SPEECH_UNAVAILABLE`. Log the
     provider id and error code in dev only, never audio or text. Never include provider response
     bodies in errors.
   - Idempotency: if `utteranceId` was seen for this session within 2 minutes (in-memory per instance
     is acceptable, bounded to 500 entries), return the cached result instead of calling the provider
     again. Document that this is per instance.
   - Nothing about audio is written to any store or log.
6. **`@speeq/speech` adapters**: `createOpenAICompatibleStt` and `createOpenAICompatibleTts`
   (section 6). STT posts multipart to `<baseURL>/audio/transcriptions` with `model`, `language`
   (ISO 639-1 derived from the tag, omitted when `language` is absent), `prompt` (from hints),
   `response_format: "verbose_json"`, `temperature: 0`. Map the response `language` name/code back to a
   BCP 47 base tag when present. TTS posts JSON to `<baseURL>/audio/speech` (`model`, `input`, `voice`,
   `response_format`, `speed` from `rate`) and returns the body stream. Unsupported params go in
   `ignored`. `listVoices` returns the voices given in config (OpenAI-compatible servers have no
   standard list API). 429 → `RATE_LIMITED` with `retryAfterMs` from `retry-after`; other non-2xx →
   `PROVIDER_ERROR`; abort → rethrow. Never log keys. Do not add Groq-specific helpers: Groq is just
   `createOpenAICompatibleStt` with the base URL `https://api.groq.com/openai/v1`; document that in the
   package README and in `voice-providers.md`.
7. **Client voice detector refactor**: extract the pure detection logic from `mic-monitor.ts` into
   `voice-detector.ts` (class with `push(rms, now, playing)` returning `"voice"|"quiet"|null` plus
   `level`). `mic-monitor.ts` uses it. **No behaviour change**: all existing mic-monitor tests pass
   unchanged.
8. **Endpointing** (`endpointing.ts`, pure state machine): input is the stream of `{ rms, now }`
   frames; output events `speechStart` and `speechEnd`. Options and defaults in section 6. Pre-roll is
   handled by the capture buffer, not here. Must not end an utterance on a short pause (< `endpointMs`)
   and must end within `endpointMs` + one frame after real silence. Must cap at `maxUtteranceMs`.
9. **PCM capture + WAV** (`pcm-capture.ts`, `wav.ts`): AudioWorklet from a Blob URL posting
   128-frame blocks; fallback `ScriptProcessorNode`; mono downmix; linear resampling to 16 kHz;
   16-bit little-endian WAV encoder; keeps a rolling pre-roll ring buffer (`preRollMs`).
   `getUserMedia` constraints: `echoCancellation`, `noiseSuppression`, `autoGainControl` all `true`.
   Pure parts (resample, encode, ring buffer) tested in Node; browser parts behind small injectable
   interfaces so they are testable with fakes.
10. **`ServerSpeechInput`** implements `SpeechInput`: `capabilities = { streaming: "buffered",
    detectsLanguage: <from config response>, processing: "remote" }`. Flow: open mic on `start()` (this
    must be called from a user gesture; surface `not-allowed` correctly) → run endpointing → on
    `speechStart` call `handlers.onSpeechStart()` → on `speechEnd` encode WAV (pre-roll included) and
    POST it → `onFinal(text)` (empty or `silent` → no `onFinal`, and in single-utterance mode call
    `onError({code:"no-speech"})`). `continuous: true` keeps the mic open and repeats. `onInterim` is
    **never** called (it is buffered). `stop()` ends the current utterance and still delivers it;
    `abort()` drops it. Network or provider failure → `onError({code:"network"})` and, in a call, the
    existing restart limit applies. Closes the mic and audio context on `onEnd`. Never uploads audio
    that contained no detected voice.
11. **`ServerSpeechOutput`** implements `SpeechOutput` (section 6 contract): `speak()` POSTs
    `synthesize`, decodes with `AudioContext.decodeAudioData`, plays an `AudioBufferSourceNode`, resolves
    on end or cancel. `prepare(text, options)` starts fetch + decode for upcoming sentences into a cache
    (max 3 entries, keyed by text+voice+language+params, cleared on `cancel()`). `cancel()` stops the
    source, aborts in-flight fetches and clears the cache. `pause()`/`resume()` use `AudioContext`
    `suspend`/`resume`. `hasVoiceFor` uses a cached `GET voices`. `listVoices` passes through. Failure
    to synthesize rejects with `SpeeqError`; if `fallback` (a `SpeechOutput`, default the Web Speech
    output) is configured, the failing sentence is spoken by it instead.
12. **Client wiring**: new option `voice?: { input?: "browser" | "server"; output?: "browser" |
    "server"; endpointMs?: number; fallbackToBrowserVoice?: boolean }` on `createSpeeqClient`, passed
    through `SpeeqProvider`. An explicit `speech: { input, output }` object still wins. `"server"`
    builds the classes from requirement 10 and 11 using the client's own session-aware fetch (reuse the
    auth/refresh logic in `session.ts`; do not duplicate it). `SpeechQueue` calls `output.prepare?.()`
    for each sentence when it is enqueued. Snapshot gains `voice: { input: "browser" | "server";
    output: "browser" | "server"; streaming: StreamingMode; processing: "local" | "remote" }`
    (additive; update the initial-snapshot test). If `voice.input` is `"server"` but the session config
    says `speech.stt === false`, fall back to the browser input and set an informational
    `snapshot.error`-free note (`voice.input` reports what is really active).
13. **Fake providers** in `@speeq/testing`: `FakeSttProvider` (scripted results, records requests,
    configurable delay and failures), `FakeTtsProvider` (returns a small valid WAV stream), both with
    a `kind` option.
14. **Umbrella and release plumbing**: `speeq/speech` re-exports `@speeq/speech`; `@speeq/speech` is in
    the Changesets fixed group; pack scripts include it; dependency-direction check knows it (depends
    only on core). Add `.changeset/voice-foundation.md` (minor for core, client, react, server,
    testing, speech, speeq).
15. **Benchmark harness** `tools/voice-bench` (private, `"private": true`, not published, run with
    `tsx`): see section 5.8 below.
16. **Docs**: new page `guides/voice-providers.md` (what each mode is, which providers, the policy
    gate, free-tier honesty, `buffered` vs `native`, privacy: Web Speech in Chrome is remote, how to
    run the benchmark). Update `guides/voice.md` and `reference/{client,server-config,protocol,errors}.md`.
    Add the page to `nav.ts`. Do not claim anything the code does not do; do not state latency or
    accuracy numbers.

### 5.8 Benchmark harness (`tools/voice-bench`)

- `bench stt --provider openai-compatible --base-url <url> --model <name> --manifest <file> [--language
  te-IN] [--runs 1] [--concurrency 1] [--out reports/]`; key from env `VOICE_BENCH_API_KEY`.
- `bench tts --provider openai-compatible --base-url <url> --model <name> --voice <id> --sentences
  <file.txt>` measures time to first byte and total time per sentence.
- `bench score --results <file.json> --manifest <file>` scores hypotheses that were produced
  elsewhere (this is how browser Web Speech results are compared: a person reads the reference
  sentences, pastes what the browser wrote into `{ "<id>": "<text>" }`).
- `bench manifest --from-tsv <file.tsv> --audio-dir <dir> --language te-IN --license CC-BY-4.0` builds
  a manifest from a folder of WAV files and a `id<TAB>reference` file.
- `bench fetch fleurs --language te_in --count 50` is **best effort**: download a small subset of
  FLEURS (CC-BY-4.0) and build a manifest. If the Hugging Face API shape differs from what you can
  verify, do not guess: print clear manual download steps instead and exit non-zero. Document it.
- Manifest schema: `{ name, license, items: [{ id, audio, language, reference, tags?: string[] }] }`
  validated with zod. Audio paths relative to the manifest.
- **Metrics**: WER (word level) and CER (grapheme level, `Intl.Segmenter`) after normalisation: NFC,
  lowercase Latin only, strip punctuation including the danda `।`/`॥`, collapse whitespace, optional
  `--strip-zwj`. Latency p50/p95/p99 of provider time. Error and rate-limit counts. **Per language
  reports; never average across languages.** Group also by `tags`.
- **Report**: JSON and Markdown, with an environment block (OS, Node version, CPU model/count, date,
  provider, model, base URL host only, runs, concurrency, whether a network RTT note was supplied via
  `--network-note`). The Markdown states clearly: "Measured on the above conditions only."
- Tests: WER/CER on English, Telugu and Hindi strings (including combining marks, ZWJ, danda),
  normaliser, percentile function, manifest validation, report rendering. No network in tests.

## 6. Contracts (must match exactly)

```ts
// packages/core/src/interfaces/speech-provider.ts
export type ProviderKind = "self-hosted" | "remote-free-tier" | "remote-paid";
export type StreamingMode = "native" | "simulated" | "buffered";
export type AudioFormat = "mp3" | "wav" | "opus" | "pcm16";

export interface SttHints {
  vocabulary?: readonly string[];
  prompt?: string;
}
export interface SttRequest {
  audio: Uint8Array;
  /** MIME type of `audio`, for example `audio/wav`. */
  mimeType: string;
  /** BCP 47. Omit to let the provider detect the language. */
  language?: string;
  hints?: SttHints;
  signal?: AbortSignal;
}
export interface SttResult {
  text: string;
  /** BCP 47 base tag as reported by the provider, if it reports one. */
  language?: string;
  languageConfidence?: number; // 0..1
  confidence?: number; // 0..1, only when the provider reports it
  audioMs?: number;
  /** Time spent in the provider call, measured by speeq. */
  providerMs: number;
}
export interface SttCapabilities {
  streaming: StreamingMode;
  detectsLanguage: boolean;
  vocabulary: "native" | "prompt" | "none";
  languages: readonly string[] | "any";
  maxAudioSeconds: number;
}
export interface SttProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly capabilities: SttCapabilities;
  transcribe(request: SttRequest): Promise<SttResult>;
}

export interface VoiceInfo {
  id: string;
  name: string;
  languages: readonly string[];
  locale?: string;
  gender?: "female" | "male" | "neutral";
  accent?: string;
  styles?: readonly string[];
  provider: string;
  processing: "local" | "remote";
  streaming: boolean;
  supports: { rate: boolean; pitch: boolean; volume: boolean; style: boolean };
}
export type VoiceParam = "rate" | "pitch" | "volume" | "style";
export interface TtsRequest {
  text: string;
  language: string;
  voiceId?: string;
  rate?: number; // 1 = normal
  pitch?: number; // 1 = normal
  volume?: number; // 0..1
  style?: string;
  format?: AudioFormat;
  signal?: AbortSignal;
}
export interface TtsResult {
  audio: ReadableStream<Uint8Array>;
  mimeType: string;
  /** Parameters the provider could not apply. */
  ignored: readonly VoiceParam[];
}
export interface TtsCapabilities {
  streamingAudio: boolean;
  formats: readonly AudioFormat[];
  languages: readonly string[] | "any";
}
export interface TtsProvider {
  readonly id: string;
  readonly kind: ProviderKind;
  readonly capabilities: TtsCapabilities;
  listVoices(): Promise<readonly VoiceInfo[]>;
  synthesize(request: TtsRequest): Promise<TtsResult>;
}
```

```ts
// packages/core/src/interfaces/speech.ts  (additive only)
export interface SpeechInputCapabilities {
  streaming: StreamingMode;
  detectsLanguage: boolean;
  processing: "local" | "remote";
  providerId?: string;
}
// SpeechInput gains:
readonly capabilities?: SpeechInputCapabilities;
// SpeakOptions gains:
voiceId?: string; rate?: number; pitch?: number; volume?: number; style?: string;
// SpeechOutput gains:
prepare?(text: string, options: SpeakOptions): void;
listVoices?(language?: string): Promise<readonly VoiceInfo[]>;
```

```ts
// packages/core/src/schemas/speech.ts
export const TranscribeQuerySchema = z.object({
  language: LanguageSchema.optional(),
  utteranceId: z.string().min(1).max(100).optional(),
});
export const TranscribeResponseSchema = z.object({
  text: z.string(),
  silent: z.boolean().optional(),
  language: LanguageSchema.optional(),
  languageConfidence: z.number().min(0).max(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  providerId: z.string().optional(),
  providerMs: z.number().nonnegative().optional(),
  audioMs: z.number().nonnegative().optional(),
});
export const SynthesizeRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  language: LanguageSchema,
  voiceId: z.string().max(100).optional(),
  rate: z.number().min(0.25).max(4).optional(),
  pitch: z.number().min(0.25).max(4).optional(),
  volume: z.number().min(0).max(1).optional(),
  style: z.string().max(200).optional(),
  format: z.enum(["mp3", "wav", "opus", "pcm16"]).optional(),
});
export const VoicesResponseSchema = z.object({ voices: z.array(VoiceInfoSchema) });
```

```ts
// createSpeeq({ ..., speech })
speech?: {
  stt?: readonly SttProvider[];
  tts?: readonly TtsProvider[];
  /** Ordered provider ids per language tag. `default` is the fallback entry. Unlisted providers never run. */
  routing?: {
    stt?: Record<string, readonly string[]>;
    tts?: Record<string, readonly string[]>;
  };
  policy?: { allowRemote?: boolean; allowPaid?: boolean }; // both default false
  limits?: {
    maxAudioBytes?: number; // default 5_000_000
    maxAudioSeconds?: number; // default 60
    maxTtsChars?: number; // default 1000
    transcribePerMinute?: number; // default 30
    synthesizePerMinute?: number; // default 60
    providerTimeoutMs?: number; // default 15_000
  };
};
```

```ts
// @speeq/speech
export function createOpenAICompatibleStt(o: {
  id?: string; // default "openai-compatible-stt"
  kind: ProviderKind;
  baseURL: string;
  apiKey?: string;
  model: string;
  languages?: readonly string[] | "any";
  fetch?: typeof fetch;
}): SttProvider;
export function createOpenAICompatibleTts(o: {
  id?: string;
  kind: ProviderKind;
  baseURL: string;
  apiKey?: string;
  model: string;
  voices: readonly Omit<VoiceInfo, "provider" | "processing" | "streaming">[];
  defaultVoice?: string;
  format?: AudioFormat; // default "mp3"
  fetch?: typeof fetch;
}): TtsProvider;
```

```ts
// client
voice?: {
  input?: "browser" | "server";
  output?: "browser" | "server";
  endpointMs?: number; // default 700
  fallbackToBrowserVoice?: boolean; // default true (browser voice is local)
};
// endpointing defaults
{ endpointMs: 700, minUtteranceMs: 250, maxUtteranceMs: 30_000, preRollMs: 300, voiceHoldMs: 90 }
```

## 7. Tests required

Core: schemas accept/reject; every new error code has a status and message.
Server (use `FakeSttProvider`/`FakeTtsProvider`): routes absent when `speech` missing; auth required;
policy matrix (every kind × allowRemote × allowPaid × listed/unlisted, language fallback tag → base →
default); fallback order on `RATE_LIMITED`/`PROVIDER_ERROR`/timeout; `INVALID_INPUT` stops the chain;
all fail → `SPEECH_UNAVAILABLE`; paid provider **never** called without `allowPaid` even when it is the
only listed one; body cap enforced while streaming (a 100 MB stream is cut off early, memory bounded);
too short → `INVALID_INPUT`; silent WAV → empty result and provider **not** called; `utteranceId`
replay returns cached result and calls the provider once; rate limit per route; no audio or text in
errors; `X-Speeq-Ignored` header; `createSpeeq` config validation errors.
Adapter (mock `fetch`): request shape for STT and TTS, language code mapping (`te-IN`→`te`,
`en-IN`→`en`), `prompt` from hints, 429 with `retry-after`, 5xx, abort, malformed JSON, `verbose_json`
language mapping, no key in thrown messages.
Client: voice detector (existing tests unchanged); endpointing (short pause does not end, long silence
ends, max cap, double speech); resample and WAV encode (header bytes, length, clipping); ring buffer
pre-roll; `ServerSpeechInput` with fake audio (silence never uploaded, one utterance → one upload,
continuous mode repeats, `stop` delivers, `abort` drops, mic denied → `not-allowed`, failure →
`network`); `ServerSpeechOutput` with fake `AudioContext` (ordered playback, `prepare` prefetch hit,
cancel aborts fetches and clears cache, pause/resume, failure falls back); `SpeechQueue` calls
`prepare`; `voice.input: "server"` with `speech.stt === false` falls back to browser;
snapshot `voice` field; existing call-mode tests pass unchanged.
Harness: as in 5.8.

## 8. Acceptance

- `scripts/verify.sh` passes (lint, typecheck, tests, build).
- With `FakeSttProvider` the full path works in a test: client fake audio → route → provider → text →
  `onFinal`.
- `grep -R "MediaRecorder" packages/client/src` finds nothing.
- Client bundle: `@speeq/client` still has zero runtime dependencies; report the size before/after.
- No file under `packages/server/src/telemetry/**` changed.
- `pnpm --filter @speeq/voice-bench exec tsx src/cli.ts score --help` works.
- Report lists, per requirement, done / partly / not done, and every decision you made. If you run out
  of room, commit what is finished, mark the rest "not done" in the report, and stop cleanly.

## 9. Finish

Work in small commits (Conventional Commits, no attribution), one per requirement group where
possible, so progress survives an interruption. Write `handoff/reports/012-voice-foundation.md` using
`handoff/REPORT_TEMPLATE.md` and print it at the end. Do not merge to main. Do not push.
Also list in the report: (a) new package `@speeq/speech` needs an npm placeholder and a Trusted
Publisher before its first release (maintainer action), (b) anything you could not verify without real
audio or real providers.

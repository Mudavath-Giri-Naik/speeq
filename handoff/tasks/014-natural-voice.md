# TASK 014 — Natural conversation: endpointing, voices, reliability, analytics, latency, docs

Branch: task/014-natural-voice (create it from latest main, **after 013 is merged**)

## 1. Read first

- `docs/decisions/0011-voice-architecture.md` (this brief implements D5, D7, D11-D13 and the docs
  and measurement parts of D14), plus any ADR 0012 if it exists
- `handoff/reports/012-voice-foundation.md`, `handoff/reports/013-indic-accuracy.md`
- `packages/client/src/{client.ts,endpointing.ts,pcm-capture.ts,server-speech-input.ts,server-speech-output.ts,speech-queue.ts,voice-detector.ts,web-speech-output.ts}`
- `packages/core/src/utils/` (`SentenceChunker`), `packages/server/src/speech/*`, `packages/server/src/handler/*`,
  `packages/server/src/audit/*` (how `authorize` guards audit routes), `packages/server/src/telemetry/*`
  (**read only**: it must not change)
- `packages/react/src/*`, `apps/docs/components/assistant/*`, `apps/docs/lib/assistant/*`
- `tools/voice-bench/*`

## 2. Goal

Voice feels like talking to a person: it stops the moment you speak, does not cut you off when you
pause to think, speaks the first words early, offers real voices with honest controls, keeps working
or degrades cleanly when a provider fails, and gives the business its own measurements. After this
task the docs are complete and every capability in them is real and tested. A capability matrix says,
for every section of the original upgrade request, what is built, what is measured and what is not.

## 3. Decisions already made (do NOT change or re-decide)

- Simulated streaming is **off by default**, always labelled `simulated`, and rate-budgeted
  (ADR D5). Native streaming over WebSocket is out of scope (ADR D16).
- Silero or any ONNX/WASM VAD is **not** bundled. Only the `VadEngine` interface and the existing
  energy detector ship (ADR D7).
- Voice analytics are business-owned, in memory, never in anonymous telemetry. **Do not touch
  `server/src/telemetry/**` or the telemetry schema**; the existing forbidden-fields test must pass
  unchanged.
- The microphone opens only because the developer's code calls `startCall`/`startPushToTalk` (which
  the developer ties to a user gesture), reports its state in the snapshot, and stops after an idle
  timeout. speeq is headless: it exposes the state, the developer shows the indicator.
- Fallback never moves audio to an unapproved place. Fallback to **browser speech recognition is off by
  default** (Chrome sends that audio to Google). Fallback to browser **voices** is on by default
  (local, sends nothing).
- Never silently use a paid provider (policy gate from 012 is unchanged).
- Unsupported voice parameters are reported (`ignored`), never faked.
- No voice cloning. No personal voice samples.
- Do not add runtime dependencies.

## 4. Scope

Create: `packages/client/src/{push-to-talk.ts,audio-quality.ts,partials.ts,voices.ts,timing.ts,vad.ts}`,
`packages/server/src/speech/{breaker.ts,stats.ts,characters.ts,metrics-route.ts}`,
`packages/react/src/use-voices.ts`, `tools/voice-bench/src/e2e.ts`,
`apps/docs/content/guides/{voice-getting-started.md,voice-voices.md,voice-privacy.md,voice-reliability.md,voice-examples.md,voice-troubleshooting.md,voice-upgrade.md,voice-browsers.md,voice-benchmarks.md}`,
`docs/maintainers/voice-capability-matrix.md`, `.changeset/natural-voice.md`.

Modify: `packages/core/src/{interfaces/speech.ts,interfaces/speech-provider.ts,schemas/{http,speech}.ts,utils/*}`,
`packages/client/src/{client.ts,types.ts,endpointing.ts,server-speech-input.ts,server-speech-output.ts,web-speech-output.ts,speech-queue.ts,index.ts}`,
`packages/server/src/{config.ts,define.ts,handler/index.ts,handler/turn.ts,speech/*}`,
`packages/react/src/{hooks.ts,provider.tsx,index.ts}`, `packages/testing/src/*`,
`apps/docs/content/guides/{voice.md,voice-providers.md,multilingual.md}`, `apps/docs/content/reference/*.md`,
`apps/docs/content/nav.ts`, `apps/docs/lib/assistant/{speeq.ts,transcript.ts}`,
`apps/docs/components/assistant/*`, `tools/voice-bench/src/*`.

Do NOT touch: telemetry (code, schema, tests), audit schema, platform app.

## 5. Requirements

1. **Pluggable VAD**: `VadEngine` (section 6). The existing detector becomes the default engine
   (`EnergyVad`). `endpointing.ts` and `ServerSpeechInput` take a `VadEngine`. No behaviour change by
   default; existing tests pass.
2. **Endpointing that waits for thoughts**: options `voice.endpoint = { minSilenceMs?, maxSilenceMs?,
   adaptive? }` (defaults 700 / 1200 / true; the old `endpointMs` stays as an alias for
   `minSilenceMs`). Adaptive rule (pure, tested): utterances shorter than 1.2 s (a word, a number)
   end after `max(350, minSilenceMs * 0.65)`; utterances longer than 4 s wait `min(maxSilenceMs,
   minSilenceMs * 1.3)`; otherwise `minSilenceMs`. **Turn merge window**: `voice.mergeWindowMs`
   (default 600, `0` disables): after a final transcript, hold the turn that long; if the visitor
   starts speaking again, append the next transcript (joined with a space) and send once. Tested with
   fake timers: resume inside the window merges, resume after it sends two turns, merge never
   exceeds 3 utterances or 20 s.
3. **Push-to-talk and call safety**: `client.startPushToTalk()` opens the mic and records until
   `client.endPushToTalk()` (no endpointing, no echo guard), then sends one utterance. Snapshot gains
   `mic: { state: "off" | "on"; mode: "none" | "call" | "push-to-talk"; since: number | null }`.
   `voice.idleTimeoutMs` (default 60 000, `0` = never): in a call, if no speech is detected for that
   long, end the call and emit `client.on("voice.idle")`. `endCall`/`destroy`/`pagehide` always close
   the mic and the audio context. Test the state transitions and that nothing opens the mic on its own.
4. **Input device and audio quality**: `client.listInputDevices()` (`enumerateDevices`, labels only
   after permission), `voice.inputDeviceId` and `client.setInputDevice(id)` (restarts capture during a
   call). `audio-quality.ts` (pure) turns frames into snapshot `audioQuality: { clipping: boolean;
   tooQuiet: boolean; noisy: boolean } | null` with hysteresis (clipping = ≥ 0.5% samples at full
   scale over 1 s; too quiet = speech detected but peak < 0.05; noisy = floor > 0.04 for 2 s). Emit
   `client.on("voice.quality")` on change. No audio is stored.
5. **Simulated streaming partials** (`partials.ts`): `voice.partials = "off" | "simulated"` (default
   `"off"`). When `simulated`: while the visitor speaks, every `partialEveryMs` (default 1200, minimum
   800) send the audio so far to `transcribe?partial=1`; at most one request in flight; discard stale
   answers; at most `maxPartialsPerUtterance` (default 6); deliver through `onInterim`. Snapshot
   `voice.streaming` becomes `"simulated"`. Server: `partial=1` requests skip the idempotency cache,
   use their own rate bucket (`limits.partialPerMinute`, default 90), and are logged as partial in the
   stats. Docs must show the request-count cost against free-tier limits.
6. **Chunking for early audio** (`core/utils`): extend `SentenceChunker` with options `{ minChars: 24,
   maxChars: 140, earlyFlush: true }`. Terminators: `. ? ! … । ॥ ؟`, newline. `earlyFlush` releases the
   first chunk at the first clause boundary (`, ; : — –` or Telugu/Hindi comma forms) once it has
   `minChars`. Long sentences split at the last clause boundary before `maxChars`. Never split inside
   numbers (`1,200`, `3.5`), abbreviations in a configurable list, or URLs. Defaults must keep the
   existing chunker tests green. Tests for English, Telugu and Hindi (danda), numbers, ellipsis.
7. **Voice discovery and preview** (`client/voices.ts`, `react/use-voices.ts`):
   `client.listVoices(language?)` merges browser voices (`speechSynthesis.getVoices()` as `VoiceInfo`,
   `processing: "local"`, `provider: "browser"`, `supports` set to what the Web Speech API allows) with
   server voices (`GET voices`); never lists a voice the active output cannot actually use.
   `client.previewVoice(voiceId, text?)` speaks a short sample without touching the conversation.
   `useVoices(language?)` returns `{ voices, loading, error, preview, select, selected }`. Selection is
   stored through `voice.voiceId` (and `sessionStorage` only if `persistSession` is on).
8. **Voice characters** (server-owned mapping): `speech.characters?: VoiceCharacter[]` and
   `speech.defaultCharacter?` (section 6). `ClientConfig.speech` additionally exposes
   `characters: {id,label,personality?}[]` (labels only). `SynthesizeRequest` gains `characterId?`; the
   server resolves voice, style, rate, pitch and volume per language (exact tag → base → `default`) and
   validates against the provider's `supports`; unsupported parameters are dropped and reported in
   `X-Speeq-Ignored`. Client: `voice.character`, `client.setCharacter(id)`, `client.listCharacters()`.
   Browser output uses `voice.browserVoices` (language → voice name/URI) since characters do not apply
   there. Personalities are labels and prompts to the provider's `style`, nothing more; do not claim
   emotion control a provider lacks.
9. **Voice parameters honesty**: `ServerSpeechOutput` and `WebSpeechOutput` honour `rate`, `pitch`,
   `volume`, `voiceId` from `SpeakOptions` where possible and expose
   `client.getVoiceSupport()` → which parameters the active output really supports. Log a single
   dev-only warning per unsupported parameter. Pronunciation hints: `voice.pronunciations?:
   Record<string, string>` replaces a term with its respelling in the text sent to speech (spoken
   text only; the visible message is unchanged). Tested.
10. **Reliability** (server `breaker.ts`): per-provider circuit breaker (opens after 3 consecutive
    failures for 30 s, then one probe), honours `RATE_LIMITED.retryAfterMs` by skipping that provider for
    that long, state in memory per instance (documented). `GET /session/:id/speech/health` returns
    provider ids with `ok | degraded | open` and nothing else (no keys, no URLs). The policy order from
    012 still decides who is eligible; the breaker only skips eligible providers temporarily.
    **Turn idempotency**: `TurnRequest` gains `utteranceId?`; a repeated `utteranceId` in the same session
    within 5 minutes never re-runs the turn or any tool: respond `CONFLICT` ("That was already
    handled."). Bounded in-memory map (1000 entries); documented as per instance. The client sets it for
    voice turns and does not retry a `CONFLICT`.
11. **Graceful degradation** (client): snapshot `voice.degraded: null | { reason: "unavailable" |
    "unsupported" | "mic-denied" | "quota"; since: number }`. Provider failure → the call keeps going in
    text mode with the reason set; output falls back to browser voices if allowed (default) ; input falls
    back to browser recognition only if `voice.fallbackToBrowserInput` is `true` (default `false`, and
    docs say why). `voice.requireLocalProcessing: true` (privacy mode): browser recognition is never used
    (it is remote), server speech is used only if the session config says its input processing is
    `local`, otherwise voice input is unavailable and the UI should show text. `ClientConfig.speech`
    exposes `stt: { enabled: boolean; processing: "local" | "remote" }` (derive from the routed
    providers' kinds; mixed → `remote`). Tested including that nothing is sent to a remote provider in
    this mode.
12. **Business-owned voice analytics** (`server/speech/stats.ts`, `metrics-route.ts`): in-memory
    collector with, per interval since start: transcribe counts (ok, failed, silent, partial) by
    language and provider; fallback count; breaker opens; rate-limited count; synthesize counts and
    characters by voice; audio seconds; provider latency p50/p95/p99 (transcribe, synthesize first byte);
    client-reported timings (first partial, endpoint-to-final, turn-to-first-token, speech-end-to-first-audio,
    interruption latency); interruption count; call abandonment (call ended without a turn);
    clarification count (voice-guard blocks from 013); voice-to-action rate (voice turns that ended in a
    tool call or navigation ÷ voice turns); estimated cost from `speech.pricing` (`{ currency, sttPerHour?:
    Record<id, number>, ttsPer1kChars?: Record<id, number> }`). Every metric carries
    `source: "measured" | "reported-by-client" | "estimated"`. **Do not report accuracy**; recognition success
    is not accuracy and the doc string on the stats type says so. `POST /session/:id/speech/metrics`
    accepts only numbers and booleans from the client (schema-validated, 2 KB cap, rate limited, ignored
    unless `voice.reportMetrics` is on in the client and `speech.acceptClientMetrics` is true on the server).
    Read access: `speeq.voiceStats()` in code and `GET /audit/voice-stats`, protected by the **same
    `authorize` rule as the other audit routes** (404 without it). Stats reset on restart; document how to
    poll and store them. Prove with a test that no voice metric or field appears in any telemetry payload.
13. **Latency instrumentation** (`client/timing.ts`): per voice turn, record with `performance.now()`:
    mic open, speech start, first partial, speech end, final transcript, turn sent, first token, first
    audio, playback start, and (on barge-in) voice detected → output paused. Emit
    `client.on("voice.timing", t)` with the derived durations (section 6) and the streaming mode. No audio
    or text in the event.
14. **`tools/voice-bench` e2e plumbing** (`bench e2e`): runs the real client and the real server in one
    Node process with fake audio, fake providers with configurable fixed delays and a fake LLM, N turns,
    and reports **speeq's own overhead** (everything except the injected provider delays) at
    p50/p95/p99, plus the derived timing breakdown. It states in its output that it does not measure
    real providers, networks or devices. Add `--assert-overhead-ms` so it can fail a build.
15. **Docs site dogfood** (`apps/docs`): the assistant uses `createSpeechConfig({ profile: "free-cloud" })`
    only when `SPEEQ_VOICE=server` and both `GROQ_API_KEY` and `GEMINI_API_KEY` are set; otherwise it
    keeps today's browser voice. The panel gets, only when server voice is on: a language selector with
    "Auto", and a voice picker with preview, built on the new hooks and in the existing design. Replace
    `lib/assistant/transcript.ts` by a vocabulary definition (speeq, Next.js, etc.) using the 013 module
    (keep its tests passing in the new form). Update `.env.example` (names only) and the README section.
16. **Documentation** (every page honest; no latency or accuracy numbers unless a harness report in the
    repo produced them): `voice-getting-started` (free path first: browser, then free-cloud),
    `multilingual` (update), `voice-voices` (discovery, characters, parameters, what each provider
    supports), `voice-privacy` (what is local, what is remote, Chrome Web Speech goes to Google,
    retention: raw audio is not stored, last-utterance memory option, analytics are yours, mic
    indicators, `requireLocalProcessing`), `voice-reliability` (policy gate, fallbacks, breaker,
    degradation, idempotency, free-tier limits, nothing silently paid), `voice-examples` (education,
    logistics, healthcare, e-commerce, general: vocabulary + routes + tools + a few spoken examples in
    English, Telugu and Hindi, each clearly labelled as an example, not a guarantee), `voice-troubleshooting`,
    `voice-upgrade` (from the current browser-only voice: nothing breaks, everything is opt-in),
    `voice-browsers` (matrix: Chrome, Edge, Firefox, Safari, Android, iOS; mark each cell "verified in
    automated test", "expected, not verified" or "known limitation"; only Chromium can be automated
    here), `voice-benchmarks` (how to run the harness, how to read a report, how to compare providers,
    what we have not measured). Add all to `nav.ts`; keep the docs build and search-index tests green.
17. **Capability matrix** (`docs/maintainers/voice-capability-matrix.md`): one row for each numbered
    section (4 to 31) of the original upgrade request (the maintainer's brief, summarised in ADR 0011):
    status `built | built-unverified | measured | deferred | not built`, where it lives, which test proves
    it, and what is still unmeasured. Be strict: "built" needs a passing test; "measured" needs a report
    in the repo.

## 6. Contracts (must match exactly)

```ts
// core/interfaces/speech.ts (additive)
export interface VadFrameResult {
  speech: boolean;
  probability?: number;
}
export interface VadEngine {
  readonly id: string;
  /** Feed one frame of mono samples in -1..1. */
  push(frame: Float32Array, sampleRate: number, nowMs: number): VadFrameResult;
  reset(): void;
}
```

```ts
// core: VoiceCharacter (used by server config and exposed as labels to the client)
export type VoicePersonality =
  | "professional"
  | "friendly"
  | "calm"
  | "energetic"
  | "educational"
  | "formal"
  | "conversational";
export interface VoiceCharacterVoice {
  voiceId: string;
  style?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}
export interface VoiceCharacter {
  id: string;
  label: string;
  personality?: VoicePersonality;
  /** Keyed by language tag, base language, or "default". */
  voices: Readonly<Record<string, VoiceCharacterVoice>>;
}
```

```ts
// client options (additive)
voice?: {
  input?: "browser" | "server"; output?: "browser" | "server";
  endpoint?: { minSilenceMs?: number; maxSilenceMs?: number; adaptive?: boolean };
  mergeWindowMs?: number; idleTimeoutMs?: number;
  inputDeviceId?: string; partials?: "off" | "simulated"; partialEveryMs?: number; maxPartialsPerUtterance?: number;
  vad?: VadEngine;
  voiceId?: string; character?: string; browserVoices?: Record<string, string>;
  pronunciations?: Record<string, string>;
  fallbackToBrowserVoice?: boolean; fallbackToBrowserInput?: boolean; requireLocalProcessing?: boolean;
  reportMetrics?: boolean; keepLastUtterance?: boolean;
};
// snapshot (additive)
mic: { state: "off" | "on"; mode: "none" | "call" | "push-to-talk"; since: number | null };
audioQuality: { clipping: boolean; tooQuiet: boolean; noisy: boolean } | null;
voice: { /* from 012 */ degraded: null | { reason: "unavailable" | "unsupported" | "mic-denied" | "quota"; since: number } };
// methods and events
startPushToTalk(): void; endPushToTalk(): void;
listInputDevices(): Promise<{ id: string; label: string }[]>; setInputDevice(id: string): void;
listVoices(language?: string): Promise<readonly VoiceInfo[]>; previewVoice(voiceId: string, text?: string): Promise<void>;
listCharacters(): { id: string; label: string; personality?: VoicePersonality }[]; setCharacter(id: string): void;
getVoiceSupport(): Record<VoiceParam, boolean>;
on("voice.idle" | "voice.quality" | "voice.timing", ...)
// voice.timing payload
interface VoiceTiming {
  utteranceId: string; streaming: StreamingMode;
  micToSpeechStartMs?: number; speechStartToFirstPartialMs?: number; endpointMs: number;
  speechEndToFinalMs: number; finalToTurnSentMs: number; turnToFirstTokenMs?: number;
  firstTokenToFirstAudioMs?: number; speechEndToFirstAudioMs?: number; interruptionMs?: number;
}
```

```ts
// server config (additive)
speech?: { /* from 012/013 */
  characters?: readonly VoiceCharacter[]; defaultCharacter?: string;
  pricing?: { currency: string; sttPerHour?: Record<string, number>; ttsPer1kChars?: Record<string, number> };
  acceptClientMetrics?: boolean; // default false
  limits?: { /* from 012 */ partialPerMinute?: number /* 90 */ };
};
// stats shape (every number is a value, never an accuracy claim)
export interface VoiceStats {
  since: string;
  transcribe: { ok: number; failed: number; silent: number; partial: number; byLanguage: Record<string, number>; byProvider: Record<string, number>; latencyMs: Percentiles; audioSeconds: number; source: "measured" };
  synthesize: { count: number; chars: number; byVoice: Record<string, number>; firstByteMs: Percentiles; source: "measured" };
  reliability: { fallbacks: number; breakerOpens: number; rateLimited: number; source: "measured" };
  client: { interruptions: number; abandonedCalls: number; speechEndToFirstAudioMs: Percentiles; firstPartialMs: Percentiles; source: "reported-by-client" };
  actions: { voiceTurns: number; voiceTurnsWithAction: number; clarifications: number; source: "measured" };
  cost: { currency: string; estimated: number; source: "estimated" } | null;
}
export interface Percentiles { count: number; p50: number | null; p95: number | null; p99: number | null }
```

## 7. Tests required

Endpointing adaptive rule table; merge window (inside, outside, caps); push-to-talk lifecycle and
nothing-opens-by-itself; idle timeout; device change; audio-quality hysteresis; partials (one in flight,
stale dropped, cap, off by default, label); chunker (English, Telugu/Hindi, numbers, abbreviations, early
flush, existing tests green); voice list merging and "never lists an unusable voice"; characters
(resolution order, unsupported params dropped and reported, unknown id); pronunciations affect spoken text
only; breaker (open, half-open probe, retry-after skip, health route reveals nothing sensitive);
`utteranceId` turn dedupe (no second tool run) and the client does not retry `CONFLICT`; degradation and
`requireLocalProcessing` (assert **no remote call**); stats (percentiles, sources, cost estimate, reset,
route 404 without `authorize`, client metrics accepted only when enabled, schema rejects text fields);
telemetry unchanged and carries no voice field; timing events; e2e plumbing; docs build and search-index
tests; docs-site assistant keeps today's behaviour without the env flag.

## 8. Acceptance

- `scripts/verify.sh` passes. The existing telemetry forbidden-fields test passes unchanged.
- `bench e2e` runs and prints speeq's own overhead percentiles with the disclaimer.
- With `SPEEQ_VOICE` unset the docs site behaves exactly as before.
- The capability matrix exists and no row says `built` without a test name.
- Report: per requirement done / partly / not done, decisions made, and a **"needs the maintainer"** list:
  real-audio benchmark runs per language (en, en-IN, te, hi, te+en, hi+en) for each provider, hardware
  measurements for the sidecars, native-speaker review, Hugging Face access for gated models, real
  device/browser checks (Safari, iOS, Firefox, Android), and a real-microphone test of barge-in.

## 9. Finish

Small commits per requirement group (Conventional Commits, no attribution). Write
`handoff/reports/014-natural-voice.md` from `handoff/REPORT_TEMPLATE.md` and print it. Do not merge, do
not push. If you run out of room, commit what is finished and mark the rest "not done" in the report.

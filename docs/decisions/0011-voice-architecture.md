# ADR 0011: Multilingual voice architecture

Status: accepted. Owner: architect. Applies to briefs 012, 013 and 014.
Evidence and licences: `docs/maintainers/voice-research.md`.

## Context

speeq voice today is the browser: Web Speech for listening, `speechSynthesis` for speaking, plus the
call mode (live words, barge-in, echo guard, mic-level detector). It is free and zero-setup, but:

- Quality and language coverage are whatever the browser and OS give. Chrome recognises by sending
  audio to Google. Firefox has none. Safari is partial.
- There is no way to pick a better recogniser for Telugu or Hindi, or a natural regional voice.
- There is no vocabulary, no language detection, and no honest way to say what is streaming.

The goal is a strongly multilingual (English, Indian English, Telugu, Hindi first) voice layer that
stays headless, free to start, provider independent and privacy safe.

## Decisions

**D1. Reuse the interfaces we have.** `SpeechInput` and `SpeechOutput` (core) stay the client
contract. New things are _optional_ additions to them (capabilities, `prepare`, `listVoices`), so the
call mode, React hooks and every current integration keep working. No parallel voice stack.

**D2. Audio goes browser → the developer's own speeq endpoint → a provider.** Provider keys exist
only on the server. New session-authenticated routes: `POST /session/:id/speech/transcribe`,
`POST /session/:id/speech/synthesize`, `GET /session/:id/speech/voices`. They reuse session tokens,
rate limits and size caps. **Raw audio is never stored.** The audit log records metadata only
(provider id, language, duration, latency), never audio.

**D3. One HTTP adapter family covers most providers.** The OpenAI audio API
(`/v1/audio/transcriptions`, `/v1/audio/speech`) is spoken by Groq Whisper, OpenAI, faster-whisper
servers, whisper.cpp's server and Kokoro servers. Our own Indic sidecars will speak it too. So one
adapter, plus Gemini speech-to-text (free tier) and Sarvam (optional, paid). One new npm package:
`@speeq/speech`. No new package per provider.

**D4. Provider kinds and a hard policy gate.** Every provider declares a `kind`: `self-hosted`,
`remote-free-tier` or `remote-paid`. A request is only routed to a provider that is (a) listed in
`speech.routing` for that language, (b) allowed by `policy.allowRemote`, and (c) if `remote-paid`,
unlocked by `policy.allowPaid: true`. The default policy is `allowRemote: false`,
`allowPaid: false`. Fallback never leaves the listed chain. If the chain is exhausted the server
answers `SPEECH_UNAVAILABLE` and the client degrades to text. Nothing is ever silently switched to
a paid or unlisted provider.

**D5. Honest streaming.** `StreamingMode` is `native | simulated | buffered`. Web Speech is `native`.
HTTP file APIs (Groq, Gemini, sidecars) are `buffered`. A windowed re-transcription during speech is
`simulated`, off by default (it multiplies request counts against free-tier limits), and always
labelled. The snapshot exposes the active mode. We never present simulated as native.

**D6. Defaults, by profile. A profile is a template the developer chooses; it never switches on by
itself.**

- `browser` (zero setup, unchanged): Web Speech + `speechSynthesis`.
- `free-cloud`: Groq Whisper for English and Indian English; Gemini for Telugu and Hindi, **pending
  our own benchmark**. Free-tier limits apply and are documented.
- `self-hosted-indic`: IndicConformer sidecar for Telugu and Hindi (and 20 other languages), Whisper
  for English, Indic Parler-TTS sidecar for speech. Needs a server; GPU recommended for speech.
  Whisper is **not** the Telugu default: published zero-shot Telugu error rates are far too high.
  Final per-language defaults are decided by an ADR after the benchmark report (brief 013), not now.

**D7. Voice activity detection.** The default stays our dependency-free level detector (shipped in
0.3.0). A `VadEngine` interface lets a developer plug in Silero (ONNX) later. We do not put ONNX or
WASM in the default browser bundle.

**D8. Vocabulary is a core, pure module.** One `Vocabulary` type feeds four things: STT biasing
(Whisper `prompt`, Gemini prompt), conservative deterministic correction, hints in the LLM prompt,
and the instant client-side fixer. Corrections keep the raw transcript beside the corrected one. The
corrector **never** edits protected entities (digits, currency, dates, ids, medical or legal terms
the developer marks protected) and never guesses between candidates: ambiguity becomes a
clarification request, not a silent change.

**D9. Languages.** BCP 47 tags as today. Input language and reply language are independent. Detection
order: provider-reported language, then Unicode-script heuristic on the transcript, then the user's
preference. The user can override at any time. Protocol changes are additive (optional fields).
Browser Web Speech cannot detect language; auto mode is for server speech-to-text only, and the docs
say so.

**D10. Translation is the LLM's job.** Multilingual LLMs already understand Telugu and Hindi and
can keep identifiers untouched. No translation provider in the default path. IndicTrans2 is deferred
(heavy, and only worth adding if the benchmark shows the LLM path failing).

**D11. Voices are discoverable and honest.** `VoiceInfo` lists language, locale, gender, accent,
styles, local or remote, streaming, and which parameters (rate, pitch, volume, style) the provider
really supports. A _voice character_ is a developer-defined mapping (label, personality, per-language
voice id, style). Unsupported parameters are reported back as ignored. No voice cloning.

**D12. Retries never repeat actions.** Each spoken turn carries an `utteranceId`. The server treats a
repeated `utteranceId` in the same session as the same turn (it does not run tools twice).

**D13. Privacy modes.** Remote processing is declared on every provider and voice. `requireLocal`
mode turns off browser Web Speech recognition (Chrome sends that audio to Google) and allows only
`self-hosted` providers. The microphone is only opened from a user gesture, shows an explicit state,
and stops after a configurable idle time.

**D14. Measured, not claimed.** A reproducible harness (`tools/voice-bench`, private) measures WER and
CER per language (never averaged across languages), latency at p50/p95/p99 and records the
environment. No latency or accuracy number goes into docs without a harness run that records its
conditions. Agents cannot produce real-audio results here: the maintainer runs the harness on real
audio and hardware and hands the report back.

**D15. Packaging.** New: `@speeq/speech` (HTTP speech adapters; depends only on core), re-exported by
the umbrella as `speeq/speech`, added to the Changesets `fixed` group. Client changes live in
`@speeq/client`. Sidecars are Python reference services under `examples/voice-sidecars/`, outside the
workspace and outside npm. The first release of a new package needs the same npm placeholder and
Trusted Publisher setup as the other ten.

**D16. Deferred on purpose.** Voice cloning; IndicTrans2; in-browser Whisper or WASM ASR (no verified
Telugu or Hindi model of acceptable quality); native streaming speech-to-text over WebSocket except
as an experimental Sarvam adapter. Each can be added later behind the same interfaces.

## Consequences

- Telugu and Hindi quality becomes a _choice of provider_, measurable and replaceable, not a rewrite.
- Free users keep the browser path. Free cloud users get Groq and Gemini within published limits.
  Self-hosters get the best open Indic models, at their own hardware cost.
- Server speech-to-text is buffered, so live words come from the browser path unless simulated
  streaming is switched on. This is stated everywhere it matters.
- More surface to secure (audio upload). Mitigated by session auth, size and duration caps, rate
  limits, no persistence, and the policy gate in D4.

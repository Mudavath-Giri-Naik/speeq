# TASK 013 — Indian-language accuracy: vocabulary, language detection, Telugu/Hindi providers, evaluation

Branch: task/013-indic-accuracy (create it from latest main, **after 012 is merged**)

## 1. Read first

- `docs/decisions/0011-voice-architecture.md` (this brief implements D6, D8, D9, D10, D14)
- `docs/maintainers/voice-research.md`
- `handoff/reports/012-voice-foundation.md` and the code it added: `packages/core/src/interfaces/speech-provider.ts`,
  `packages/server/src/speech/*`, `packages/adapters/speech/*`, `packages/client/src/server-speech-*.ts`,
  `tools/voice-bench/*`
- `packages/server/src/agent/{prompt.ts,loop.ts,tools.ts}` (how instructions, tools and write-tool
  confirmation work), `packages/core/src/schemas/{http.ts,common.ts}`, `packages/client/src/client.ts`
- `apps/docs/lib/assistant/transcript.ts` (a hand-written vocabulary fixer; this task generalises it)

## 2. Goal

Telugu, Hindi and English (including Indian English and Telugu/Hindi mixed with English) are
recognised and understood well, and a developer can improve recognition for their own business with a
vocabulary instead of training a model. After this task: a vocabulary module drives recogniser
biasing, safe correction and prompt hints; the language the visitor speaks is detected (when the
provider can) and can be overridden; a free-tier provider (Gemini) and optional paid provider
(Sarvam) exist; reference self-hosted sidecars exist for the best open Indic models; and the harness
can measure speech accuracy and cross-language tool selection per language.

## 3. Decisions already made (do NOT change or re-decide)

- Vocabulary correction is **conservative**: it never edits protected spans, never chooses between
  equally good candidates, always keeps the raw transcript, and ambiguity becomes a clarification
  request. See ADR D8 and the rules in requirement 2.
- Translation is the LLM's job. Do not add a translation provider or model.
- Protocol changes are **additive and optional**. Existing clients and servers keep working.
- Language detection order: provider-reported, then Unicode-script heuristic on the transcript, then
  the user's preference. The user can always override. Web Speech cannot detect language; auto mode is
  for server speech-to-text only.
- A low-confidence or ambiguous voice turn can only make the server **stricter**. The client's
  `transcript` metadata is untrusted input: it may block write tools, never unlock anything.
- Profiles are templates the developer picks. A profile never enables a provider by itself, never
  enables a paid provider unless `allowPaid: true` is passed explicitly, and its per-language routing
  is **provisional** until ADR 0012 (the maintainer will decide the defaults from benchmark results).
- No model weights, datasets or audio are committed. No keys. Sidecars are reference code outside
  the pnpm workspace and outside npm.
- Python sidecars cannot be verified against real weights in this task. Test them with stubs and say so.

## 4. Scope

Create:

- `packages/core/src/{vocabulary.ts,language.ts}` (+ export; both pure, no dependencies)
- `packages/server/src/speech/{vocabulary.ts,profiles.ts}` and `packages/server/src/agent/voice-guard.ts`
- `packages/adapters/speech/src/{gemini-stt.ts,sarvam.ts,detect-then-transcribe.ts}`
- `packages/client/src/{language-mode.ts}`
- `examples/voice-sidecars/{README.md,docker-compose.yml,indic-stt/,indic-tts/,voices.example.json}`
- `tools/voice-bench/{cases/*.json,src/intent.ts,COLLECTING.md,manifests/README.md}`
- `apps/docs/content/guides/{multilingual.md,vocabulary.md}`
- `.changeset/indic-accuracy.md`

Modify: `packages/core/src/schemas/{http.ts,speech.ts}`, `packages/core/src/index.ts`,
`packages/server/src/{config.ts,define.ts,agent/prompt.ts,agent/loop.ts,handler/turn.ts,speech/handlers.ts}`,
`packages/client/src/{client.ts,types.ts,server-speech-input.ts,index.ts}`, `packages/react/src/*` (types only),
`packages/testing/src/*` (add what tests need), `apps/docs/content/guides/{voice.md,voice-providers.md}`,
`apps/docs/content/reference/*.md`, `apps/docs/content/nav.ts`, `tools/voice-bench/src/*`.

Do NOT touch: telemetry code or schemas, audit schema, platform app, `apps/docs/lib/assistant/**`.

## 5. Requirements

1. **Language utilities** (`core/language.ts`): `baseLanguage(tag)`, `toIso639_1(tag)`,
   `detectScripts(text)` (counts per script: Latin, Devanagari, Telugu, Tamil, Kannada, Malayalam,
   Bengali, Gujarati, Gurmukhi, Odia, Arabic), `guessLanguageFromScript(text, candidates)` returning
   `{ language?: string; confidence: number; mixed: boolean }`. Telugu script → `te`; Devanagari →
   `hi` unless candidates also contain `mr`/`ne`/`sa`, then low confidence and no language; mostly Latin →
   first English candidate; mixed text reports `mixed: true` and the dominant script. Digits and
   punctuation are ignored. Cover all 11 scripts in tests with real example sentences.
2. **Vocabulary** (`core/vocabulary.ts`, contract in section 6):
   - `correctWithVocabulary(text, vocab, options)` returns `{ raw, text, changes, ambiguous }`.
   - Matching order: exact alias (case-insensitive, NFC, whole token or whole phrase) → regional
     equivalent mapped to the canonical term when `regionalToCanonical` is true (default) → fuzzy match
     only for Latin tokens of length ≥ 5 with edit distance ≤ 1 (length < 9) or ≤ 2, only against
     non-protected terms.
   - **Protected spans are never changed and never used as fuzzy input**: any token containing a digit,
     currency amounts (`₹ $ € £` or "rupees"/"dollars" + number), percentages, dates (ISO, `12/03/2026`,
     `12 March`), emails, URLs, codes mixing letters and digits (`AB1234`), and every term with
     `protected: true`.
   - If two different terms are equally close, make **no change** and report the span in `ambiguous`.
   - Higher `weight` wins only when distances differ by less than one edit; otherwise ambiguous.
   - Pure, deterministic, no I/O, fast (budget: 2,000 terms × 30-word sentence under 5 ms).
   - `sttPromptFromVocabulary(vocab, { language, maxChars })` builds a recogniser prompt (canonical terms
     and pronunciations, most important first, never longer than `maxChars`, default 224) and
     `vocabularyHints(vocab, max)` returns the top terms.
   - `autoVocabulary({ routes, tools })` derives terms from route titles and tool names/titles so
     registered routes and tools are recognised without extra setup (not protected, low weight).
   - `defineVocabulary(v)` validates shape (zod) and freezes it.
3. **Protocol additions** (additive, optional): `TurnRequest` gains `inputLanguage?: Language` and
   `transcript?: { raw: string; confidence?: number; provider?: string; corrected?: boolean;
   ambiguous?: string[] }`. `TurnStartedEvent` gains `inputLanguage?`. `TranscribeResponse` gains
   `raw?: string`, `corrected?: boolean`, `ambiguous?: string[]`. `language` in `TurnRequest` keeps its
   meaning: the **reply** language. Update schemas, docs and every schema test.
4. **Server vocabulary use**: new config `vocabulary?: Vocabulary` on `createSpeeq`. (a) The
   `transcribe` route passes `hints` (`prompt` and `vocabulary`) to every provider, honouring
   `capabilities.vocabulary` (`none` → not sent); (b) it applies `correctWithVocabulary` to the
   provider text, returns `text` (corrected) and `raw`; (c) the agent prompt gets a short
   "Domain terms" section (top 50 hints) and the rule "The user's words may contain recognition
   mistakes. If a request depends on an unclear word, ask a short question instead of guessing";
   (d) `autoVocabulary` terms are merged in automatically.
5. **Voice guard** (`agent/voice-guard.ts`) — security relevant, keep it small and exhaustively
   tested: when a turn arrives with `inputMode: "voice"` and `transcript.ambiguous` non-empty, or
   `transcript.confidence` below `speech.clarifyBelow` (config, default `0.5`, only evaluated when the
   confidence is a number), then **no tool of kind `write` may execute in this turn**. The tool call
   returns a structured result `{ error: "needs_clarification" }` and the agent instruction for the
   turn says to ask one short confirming question. Read tools and navigation are unaffected. The
   existing confirmation flow is unchanged and still applies afterwards. Missing metadata (a text turn)
   changes nothing.
6. **Language in the turn**: the server tells the model the visitor's speech language
   (`inputLanguage`) and the reply language (`language`), and instructs: understand the request in any
   language, never translate tool names, route ids, parameters or identifiers, keep English technical
   terms as spoken, answer in the reply language. If `inputLanguage` is absent, behaviour is as before.
   Avoid any extra model call for translation.
7. **Gemini speech-to-text** (`adapters/speech/gemini-stt.ts`): `createGeminiStt({ id?, apiKey, model,
   kind?: "remote-free-tier" })`. Sends inline base64 audio to `generateContent` with
   `temperature: 0` and, for `gemini-2.5*` models, `thinkingBudget: 0`. System instruction: transcribe
   verbatim, do not translate, do not summarise, do not add words, keep English words in Latin script
   and native-language words in their own script, return empty text if there is no intelligible
   speech. Response is JSON `{ text, language }` using `responseMimeType: "application/json"` and a
   response schema. Vocabulary hints are appended as "spell these exactly if spoken". Map to
   `SttResult` (`language` as BCP 47 base tag). Capabilities: `streaming: "buffered"`,
   `detectsLanguage: true`, `vocabulary: "prompt"`. Errors map like the other adapters (429 →
   `RATE_LIMITED`). Mocked-`fetch` tests only; include a test that empty text stays empty.
8. **Sarvam adapters** (`sarvam.ts`, **experimental**, `kind: "remote-paid"`): STT and TTS. First check
   the current official docs at https://docs.sarvam.ai/ for endpoints, headers and parameters and follow
   them. If you cannot read them, implement from your best knowledge, mark every Sarvam export
   `@experimental` in JSDoc and the docs, and list it as "unverified" in the report. They are never
   part of any profile. Tests use mocked `fetch`.
9. **Detect-then-transcribe** (`detect-then-transcribe.ts`): `createDetectThenTranscribe({ id?,
   detector, transcriber, candidates })` returns an `SttProvider` that first asks `detector` (must have
   `detectsLanguage`) for the language, restricts the result to `candidates` (else falls back to the
   first candidate), then calls `transcriber` with that language. Kind is the stricter of the two (paid >
   free-tier > self-hosted). Used so an Indic-only recogniser can serve auto-detect mode.
10. **Profiles** (`server/speech/profiles.ts`): `createSpeechConfig({ profile, ...options })` returns a
    `speech` block. Profiles `browser` (returns `undefined`), `free-cloud` (Groq Whisper for `en`,
    `en-IN`, default; Gemini for `te`, `hi`; requires the developer to pass the keys; sets
    `policy.allowRemote: true` because choosing the profile and passing keys is the opt-in) and
    `self-hosted-indic` (one OpenAI-compatible sidecar base URL for STT and one for TTS, `kind:
    "self-hosted"`, detect-then-transcribe when `languageMode` is auto). `allowPaid` is never set by a
    profile. Put the routing tables in one clearly marked `PROVISIONAL` object with a comment
    pointing at ADR 0012. Tests assert no profile ever lists a paid provider unless the caller adds it.
11. **Client language mode** (`client/language-mode.ts`): options `languageMode?: "fixed" | "auto"`
    (default `"fixed"`), `preferredLanguages?: string[]`, `replyLanguage?: "same-as-input" | "fixed"`
    (default `"same-as-input"` in auto). Snapshot gains `inputLanguage: string | null`. New methods
    `setInputLanguage(tag | "auto")`. In `auto` + server input, no `language` is sent with the audio; the
    detected language (response `language`, else `guessLanguageFromScript` on the text, constrained to
    `preferredLanguages`) becomes `inputLanguage` with hysteresis: switch only when confidence ≥ 0.6 or the
    same new language is seen on two consecutive utterances. The turn sends `language` = reply language
    (must be in `config.languages`, else the default language) and `inputLanguage`. With Web Speech
    (no detection): never switch silently; run the script heuristic on each final transcript and emit
    `client.on("languageSuggestion", { suggested, confidence })` when it disagrees with the current
    language. `setInputLanguage` always wins. Test switching mid-conversation, hysteresis, override,
    unknown language, and that fixed mode is unchanged.
12. **Client vocabulary**: option `vocabulary?: Vocabulary` builds the default `call.correct`
    (instant, local) and sends `transcript: { raw, corrected, ambiguous }` with voice turns; an explicit
    `call.correct` still wins. Raw is kept in the message model (`ChatMessage.rawText?` only when it
    differs).
13. **Last-utterance retry** (opt-in): `voice.keepLastUtterance` (default `false`). When `true`,
    `ServerSpeechInput` keeps only the most recent WAV **in memory** and
    `client.retranscribeLast(language)` re-sends it forced to that language (recovery from a wrong
    detection). It is dropped on the next utterance, on `endCall` and on `destroy`. Never persisted.
14. **Sidecars** (`examples/voice-sidecars/`): FastAPI services that speak the OpenAI audio API so the
    existing adapter works unchanged.
    - `indic-stt`: `POST /v1/audio/transcriptions` (multipart `file`, `model`, `language`, `prompt`,
      `response_format`) → `{ text, language, duration }`; `GET /health`. Loads
      `ai4bharat/indic-conformer-600m-multilingual` with `transformers` (`trust_remote_code`), maps BCP 47
      to the model's language ids, supports `ctc` and `rnnt` decoding via env `DECODER`, rejects missing
      language with a clear 400 (auto mode uses detect-then-transcribe). Document the gated-model
      steps (accept terms on Hugging Face, `HF_TOKEN`) and an optional CPU/ONNX path.
    - `indic-tts`: `POST /v1/audio/speech` and `GET /v1/voices`. Loads `ai4bharat/indic-parler-tts`, voices
      come from `voices.example.json` (id → speaker name, languages, style description), `speed` is
      ignored and reported in header `X-Speeq-Ignored`. One sentence per request (no streaming claim).
    - Both: Dockerfile, `requirements.txt`, `requirements-dev.txt`, pytest tests with a stub model (no
      downloads, no GPU), bearer-token auth via env `SIDECAR_TOKEN`, request size cap, no audio or text
      logging, CPU-only default with a GPU compose profile.
    - README: what each does, hardware **to be measured** (leave a table with empty cells and a
      "measure with `bench`" note; do not invent numbers), the licence checklist (what to read and accept
      before commercial use: model card, gated terms, voice and dataset restrictions), and an explicit
      "not verified against real weights by the author of this task".
15. **Evaluation**:
    - `bench intent --cases <file> --server <url> --llm <gemini|groq|openai-compatible>` runs
      cross-language tool-selection cases against a real speeq server and reports, **per language and
      per language pair**, tool-selection accuracy, argument accuracy, navigation accuracy and
      clarification rate. Provide a small fixture app (routes + tools for education, logistics and
      e-commerce) so it runs out of the box.
    - `tools/voice-bench/cases/`: 25 cases each for `en`, `en-IN`, `te`, `hi`, `te+en`, `hi+en` (150),
      including the brief examples ("Operating Systems లో deadlock questions చూపించు", "मुझे पिछले महीने का
      report दिखाओ", "నా order status ఏంటి?", "Dashboard open చేసి revenue report చూపించు", "₹2,000 లోపు
      headphones చూపించు", "నా పార్సెల్ ఇప్పుడు ఎక్కడ ఉంది?") plus ambiguous, numeric and
      write-action cases (which must lead to a confirmation or clarification, never silent execution).
      Write natural informal phrasing, not literal translations. **Mark the file as needing review by a
      native Telugu and Hindi speaker** and say so in the report.
    - `tools/voice-bench/COLLECTING.md`: how to record consented test audio (consent wording, no
      personal data, sentence lists for te+en and hi+en with numbers, dates, names and product terms, mic and
      noise conditions to cover, storage and deletion). Add a `bench stt` option `--tag-filter`.
    - Plumbing tests run with scripted fakes. Real runs are done by the maintainer.
16. **Docs** (honest, no numbers you did not measure): `guides/multilingual.md` (language modes, detection
    order and limits, reply language), `guides/vocabulary.md` (how to write terms with aliases and
    regional forms, protected terms, what is and is not auto-corrected, clarification behaviour),
    update `voice-providers.md` (Gemini, detect-then-transcribe, profiles marked provisional, self-hosted
    sidecars, free-tier caveats, licence caution) and the references. State plainly that code-mixed
    recognition is **not validated** until the maintainer's benchmark exists.

## 6. Contracts (must match exactly)

```ts
// core/vocabulary.ts
export interface VocabularyTerm {
  /** The form to keep in text, for example "Dijkstra". */
  term: string;
  /** Other spellings or likely mishearings, in any script. */
  aliases?: readonly string[];
  /** How it is said, to help recognisers that accept a prompt. */
  pronunciations?: readonly string[];
  /** The same word in other languages, keyed by base language tag. */
  regional?: Readonly<Record<string, readonly string[]>>;
  /** Only exact matches may touch it. Never fuzzy matched. */
  protected?: boolean;
  weight?: number; // default 1
}
export interface Vocabulary {
  terms: readonly VocabularyTerm[];
}
export interface CorrectionChange {
  from: string;
  to: string;
  term: string;
  kind: "alias" | "regional" | "fuzzy";
}
export interface CorrectionResult {
  raw: string;
  text: string;
  changes: readonly CorrectionChange[];
  ambiguous: readonly { span: string; candidates: readonly string[] }[];
}
export interface CorrectionOptions {
  language?: string;
  regionalToCanonical?: boolean; // default true
  fuzzy?: boolean; // default true
}
export function defineVocabulary(v: Vocabulary): Vocabulary;
export function correctWithVocabulary(
  text: string,
  vocab: Vocabulary,
  options?: CorrectionOptions,
): CorrectionResult;
export function sttPromptFromVocabulary(
  vocab: Vocabulary,
  options?: { language?: string; maxChars?: number },
): string;
export function vocabularyHints(vocab: Vocabulary, max?: number): string[];
export function autoVocabulary(input: {
  routes?: readonly { id: string; title: string }[];
  tools?: readonly { name: string; title?: string }[];
}): Vocabulary;
```

```ts
// core/language.ts
export type ScriptName =
  | "latin"
  | "devanagari"
  | "telugu"
  | "tamil"
  | "kannada"
  | "malayalam"
  | "bengali"
  | "gujarati"
  | "gurmukhi"
  | "odia"
  | "arabic";
export function baseLanguage(tag: string): string;
export function toIso639_1(tag: string): string | undefined;
export function detectScripts(text: string): {
  counts: Partial<Record<ScriptName, number>>;
  dominant?: ScriptName;
  mixed: boolean;
};
export function guessLanguageFromScript(
  text: string,
  candidates: readonly string[],
): { language?: string; confidence: number; mixed: boolean };
```

```ts
// server
createSpeeq({ ..., vocabulary?: Vocabulary, speech?: { ..., clarifyBelow?: number } });
export function createSpeechConfig(o:
  | { profile: "browser" }
  | { profile: "free-cloud"; groqApiKey: string; geminiApiKey: string; sttModels?: { groq?: string; gemini?: string } }
  | { profile: "self-hosted-indic"; sttBaseURL: string; ttsBaseURL: string; token?: string; languageMode?: "fixed" | "auto"; detector?: SttProvider }
): SpeechConfig | undefined;

// adapters/speech
export function createGeminiStt(o: { id?: string; apiKey: string; model: string; kind?: ProviderKind; fetch?: typeof fetch }): SttProvider;
export function createDetectThenTranscribe(o: { id?: string; detector: SttProvider; transcriber: SttProvider; candidates: readonly string[] }): SttProvider;

// client
languageMode?: "fixed" | "auto"; preferredLanguages?: string[]; replyLanguage?: "same-as-input" | "fixed";
vocabulary?: Vocabulary;
voice?: { ...; keepLastUtterance?: boolean };
setInputLanguage(tag: string | "auto"): void;
retranscribeLast(language: string): Promise<void>;
on("languageSuggestion", (e: { suggested: string; confidence: number }) => void): () => void;
```

## 7. Tests required

Vocabulary: alias exact, case and NFC, regional → canonical, fuzzy accept/reject by distance and length,
**protected spans** (digits, ₹ amounts, dates, ids, emails, URLs, `protected: true` terms) never change,
two equal candidates → ambiguous and unchanged, weight rule, empty vocab, huge vocab performance budget,
Telugu/Hindi/Latin mixed sentences, idempotence (correcting twice equals once), hostile input (very long
text, regex-special characters in terms). Prompt builder respects `maxChars`. `autoVocabulary`.
Language: each script, mixed text, candidate constraint, digits/punctuation only.
Server: voice guard matrix (ambiguous, low confidence, missing metadata, write vs read vs navigation,
text turn, threshold edge, `clarifyBelow` override) — the write tool handler must **not** run; vocabulary
hints sent only when the provider says `prompt` or `native`; transcribe returns raw + corrected;
prompt contains the language rules and domain terms; no extra model call; profiles (no paid provider,
no profile enables `allowPaid`, free-cloud needs both keys); config validation.
Adapters: Gemini request/response shape, empty text, JSON schema failure → `PROVIDER_ERROR`, 429,
detect-then-transcribe (candidate restriction, fallback, kind merge, detector failure), Sarvam shapes.
Client: language mode behaviours listed in requirement 11, vocabulary correction display + raw kept,
retry-last memory lifecycle (dropped on next utterance, endCall, destroy), `languageSuggestion`.
Sidecars: pytest with stubs (language mapping, auth, size cap, missing language 400, voices list,
no logging of payloads).
Harness: intent runner plumbing with fakes, per-language aggregation, case file schema validation.

## 8. Acceptance

- `scripts/verify.sh` passes.
- `pytest` in both sidecars passes (or the report states Python was unavailable).
- A request with `transcript.ambiguous` cannot execute a write tool (test proves it).
- No profile can reach a paid provider by itself (test proves it).
- No numbers in docs that were not produced by a run.
- Report: per requirement done / partly / not done; the list of things needing the maintainer
  (native-speaker review of cases, real-audio runs, Hugging Face access for the gated models, hardware
  measurements, Sarvam doc verification).

## 9. Finish

Small commits per requirement group (Conventional Commits, no attribution). Write
`handoff/reports/013-indic-accuracy.md` from `handoff/REPORT_TEMPLATE.md` and print it. Do not merge,
do not push. If you run out of room, commit finished work and mark the rest "not done" in the report.

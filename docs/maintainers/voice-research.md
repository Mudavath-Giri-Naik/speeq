# Voice research (evidence for ADR 0011)

Researched 2026-11-26 from public sources. **Verified** = confirmed in a source we read. **Unverified**
= reported but not confirmed, or sources disagree. Re-check before relying on any licence line.
Licence and limit information changes; the harness (`tools/voice-bench`) is the source of truth for
quality and speed, not this table.

## Speech to text

| Option                                          | What we found                                                                                                                                                                                                                                                                                                                  | Status                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Web Speech API (browser)                        | Free, native streaming. In Chrome audio goes to a Google server; no offline. Firefox: behind a flag / not shipped. Safari: partial, prefixed, extra prompts. No raw audio access. te-IN and hi-IN accuracy not measured by us.                                                                                                 | Verified (MDN, caniuse); language accuracy unverified                            |
| Whisper via Groq (`whisper-large-v3`, `-turbo`) | File upload API, **not streaming**. Free tier reported at about 20 requests/min, 2,000/day, 7,200 audio-s/hour, 28,800 audio-s/day; 25 MB file cap. Sources disagree on request numbers. Paid about $0.04/hour.                                                                                                                | Verified: file cap; unverified: exact limits, check console                      |
| Whisper accuracy on Telugu / Hindi              | Zero-shot large-v3 is very poor on Telugu (reported roughly 80-95% WER in one paper) and weak on Hindi (about 27-45% WER depending on test set). Fine-tuned variants are much better. English is strong.                                                                                                                       | Verified in papers (Dolphin, Vaani report); datasets differ, not head to head    |
| AI4Bharat IndicConformer 600M                   | 22 Indian languages, hybrid CTC/RNNT. Telugu WER 26.4% in the SraVaani paper; Hindi 13.2% vs Whisper-L3 26.8% on Vaani. Licence reported MIT; the Hugging Face card is **gated**. Not designed for streaming. ONNX exports exist (about 131 MB per language int8/fp32, 622 MB multilingual). CPU speed claims are third-party. | Licence unverified (gated card); accuracy verified in papers; latency unverified |
| Gemini (audio input, generateContent)           | Handles transcription and translation, language detection per segment. **No real-time transcription in the Gemini API.** In SraVaani, Gemini 3 Flash Telugu WER 28.9% (close to IndicConformer 26.4%, Sarvam Saaras v3 28.7%). Free-tier audio quota not confirmed.                                                            | Accuracy verified (one paper); free-tier limits unverified                       |
| Sarvam (Saaras / Saarika)                       | Paid: about INR 30/hour STT; free credits reported as INR 1,000 (one competitor blog says INR 100). Realtime WebSocket model exists. Markets code-mixing for Telugu and Hindi.                                                                                                                                                 | Pricing verified on vendor page; credits unverified                              |
| sherpa-onnx                                     | Runs in WASM, supports streaming and non-streaming ASR and Silero VAD. We found **no Hindi or Telugu streaming ASR model** in its tables.                                                                                                                                                                                      | Verified (absence in what we read)                                               |
| faster-whisper / whisper.cpp                    | Run Whisper locally (CPU/GPU), usually MIT. Same accuracy limits as Whisper for Telugu. Servers exist that speak the OpenAI audio API.                                                                                                                                                                                         | Licence unverified here                                                          |

## Text to speech

| Option                      | What we found                                                                                                                                                                                                                                            | Status                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `speechSynthesis` (browser) | Free, local. Voices depend on the OS and browser; Telugu and Hindi availability varies.                                                                                                                                                                  | Verified (design); per-device availability unverified |
| AI4Bharat Indic Parler-TTS  | 21 languages including Hindi and Telugu, named speakers, style prompts. Model card says Apache-2.0 but one listing says MIT and the model is **gated**. About 0.9B parameters, GPU recommended. Official examples are batch (whole file), not streaming. | Licence inconsistent; latency unverified              |
| IndicF5                     | Licence sources conflict. Training data (Emilia CC-BY-NC, IIT-M Indic TTS) may carry a non-commercial restriction. **Treat as not cleared for commercial use.**                                                                                          | Unclear: do not ship                                  |
| Piper                       | Engine moved to GPL-3.0. Each voice has its own model card licence. Check per voice.                                                                                                                                                                     | Verified (engine); voices unverified                  |
| Kokoro                      | Apache-2.0 code and weights, 82M parameters, easy to serve. Hindi voice provenance not confirmed. Telugu not confirmed.                                                                                                                                  | Partly verified                                       |
| Meta MMS-TTS                | Non-commercial weights (CC-BY-NC), from background knowledge, **not re-verified here**. Avoid for commercial use.                                                                                                                                        | Unverified                                            |
| Gemini TTS                  | Voices and styles exist, streaming output documented for Cloud. We could not confirm Telugu or Hindi in the language table, nor an API free quota.                                                                                                       | Unverified                                            |
| Sarvam Bulbul               | Paid: INR 30 per 10,000 characters (v3), INR 15 (v2).                                                                                                                                                                                                    | Verified on vendor page                               |

## Voice activity detection and audio

- Silero VAD: a good open model, MIT licence for the model per its repo (not re-verified). The popular
  browser wrapper (`@ricky0123/vad-web`) shows ISC on npm and "other" on GitHub, about 4 MB unpacked
  plus ONNX runtime WASM. **Decision: do not depend on it; keep our level detector, add a
  `VadEngine` interface.**
- Browser `getUserMedia` constraints give echo cancellation, noise suppression and auto gain for free.
  Chrome's echo cancellation may not cancel `speechSynthesis` audio (the OS engine plays it), so the
  detector learns the assistant's own level and relies on headphones for the best result.

## Translation

IndicTrans2 is open and strong but heavy. A multilingual LLM already handles intent and reply in
Telugu and Hindi. Deferred (ADR 0011 D10).

## What is not yet known (the harness must answer)

1. Telugu and Hindi WER for Web Speech (Chrome), Groq Whisper, Gemini, and IndicConformer on the same
   audio.
2. Code-mixed (Telugu + English, Hindi + English) accuracy for each.
3. Real latency (first partial, final, first audio) on real networks and hardware, at p50/p95/p99.
4. Whether Gemini's free tier allows enough audio for a real product.
5. Whether Indic Parler-TTS is fast enough on the maintainer's hardware, and which licence text is
   authoritative.

## Sources read

Groq speech-to-text and rate-limits docs and a free Whisper API comparison; Hugging Face model cards
(AI4Bharat IndicConformer, Indic Parler-TTS, IndicF5) and AIKosh listings; arXiv papers (SraVaani 1.0,
Dolphin, prompt-tuned Whisper for Indian languages, Swanada); Sarvam pricing and changelog; Google
audio-understanding and Gemini TTS docs; MDN and caniuse for Web Speech; npm and GitHub pages for
vad-web, sherpa-onnx and Piper.

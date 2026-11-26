---

title: Voice providers
description: Configure server recognition and synthesis, choose routing policy, and compare providers.
---

# Voice providers

Browser voice is the default. Web Speech recognition can deliver interim words as the visitor speaks. Chrome can send microphone audio to a remote recognition service. Synthesis voices depend on the operating system and browser.

Server voice buffers each utterance as mono 16 kHz PCM16 WAV and sends it to your own authenticated speeq route. The server calls a configured provider. Recognition delivers final words only. Synthesis fetches and decodes one sentence at a time, and can prepare upcoming sentences during playback. speeq keeps raw audio out of storage and logs. A remote provider has its own processing and retention terms.

## Configure the server

```ts
import { createOpenAICompatibleStt, createOpenAICompatibleTts } from "speeq/speech";

const stt = createOpenAICompatibleStt({
  kind: "self-hosted",
  baseURL: process.env.STT_URL!,
  model: process.env.STT_MODEL!,
});
const tts = createOpenAICompatibleTts({
  kind: "self-hosted",
  baseURL: process.env.TTS_URL!,
  model: process.env.TTS_MODEL!,
  voices: [
    {
      id: "speaker",
      name: "Speaker",
      languages: ["en"],
      supports: { rate: true, pitch: false, volume: false, style: false },
    },
  ],
});
const speech = {
  stt: [stt],
  tts: [tts],
  routing: { stt: { default: [stt.id] }, tts: { en: [tts.id] } },
};
// Pass speech to createSpeeq alongside your agent, llm and store.
```

Choose the kind that describes the actual deployment. For Groq Whisper use the STT adapter with `baseURL: "https://api.groq.com/openai/v1"`, a server-side API key and model from configuration. For a free-tier account use `kind: "remote-free-tier"` and explicitly set `policy.allowRemote`. Quotas depend on the account. Paid services require both `allowRemote` and `allowPaid`. Keep provider keys on the server.

For each operation the router uses the first matching entry among the exact language tag, base language, and `default`. Only providers listed in that entry and permitted by policy can run. Exhausting the approved chain returns `SPEECH_UNAVAILABLE`. Keep text input available.

## Configure the client

Pass `voice: { input: "server", output: "server", endpointMs: 700 }` to the client or React provider. Each direction can use browser or server voice independently. Call microphone controls from a user gesture. Disable sentence fallback with `fallbackToBrowserVoice: false`. Inspect `snapshot.voice` for the active input and its streaming mode.

## Run a benchmark

From the repository, run `pnpm --filter @speeq/voice-bench exec tsx src/cli.ts score --help` for command forms. Use a licensed manifest with audio paths relative to the manifest file. Set `VOICE_BENCH_API_KEY` in your shell when your endpoint requires authentication.

- `manifest` builds a manifest from WAV files and tab-separated IDs and reference transcripts.
- `stt` measures recognition on the manifest. Use `--runs`, `--concurrency` and `--network-note` to record the conditions.
- `tts` reads one sentence per line and measures first-byte and total latency.
- `score` reads an ID-to-transcript JSON object. To compare Web Speech, read the same reference sentences and record the browser transcripts.
- `fetch fleurs` prints manual dataset preparation steps and exits nonzero when automatic retrieval is unavailable.

Read the JSON and Markdown files in `--out` (default `reports/`). WER and grapheme CER are reported within each language and tag. Compare runs under the same conditions.

## Indic providers and provisional profiles

Import `createSpeechConfig` from `speeq/server` and pass its result as `speech`. The browser profile returns `undefined`. The provisional free-cloud profile uses Groq Whisper for English and Gemini for Telugu and Hindi. Supply both API keys and both STT model IDs via `sttModels` or `GROQ_STT_MODEL` and `GEMINI_STT_MODEL`. Choosing this profile permits remote free-tier calls. Check your account's quotas. Profiles never enable paid access.

The self-hosted-indic profile accepts STT and TTS base URLs ending in `/v1` and a shared token. Auto mode additionally requires a self-hosted language detector. The detect-then-transcribe adapter restricts the detected language to its candidates and inherits the stricter provider kind. See `examples/voice-sidecars/README.md` in the repository for gated model access, voice licences, CPU and GPU options. Hardware and code-mixed accuracy have not been validated.

Experimental Sarvam STT and TTS are classified as remote-paid. Register them manually with both remote and paid permission if your application chooses that service. The adapters follow the documented REST contracts and have been tested with mocked responses. [Sarvam STT](https://docs.sarvam.ai/api-reference/speech-to-text/transcribe) · [Sarvam TTS](https://docs.sarvam.ai/api-reference/text-to-speech/convert)

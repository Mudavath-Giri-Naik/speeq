import {
  baseLanguage,
  SpeeqError,
  type SttProvider,
  type TtsProvider,
  type VoiceInfo,
} from "@speeq/core";
import { audioJson } from "./gemini-stt.js";

type Options = { id?: string; apiKey: string; model: string; fetch?: typeof fetch };
function language(tag: string) {
  const base = baseLanguage(tag);
  return `${base === "or" ? "od" : base}-IN`;
}
/** @experimental Buffered Sarvam REST speech recognition, always classified as paid. */
export function createSarvamStt(o: Options): SttProvider {
  return {
    id: o.id ?? "sarvam-stt",
    kind: "remote-paid",
    capabilities: {
      streaming: "buffered",
      detectsLanguage: true,
      vocabulary: "none",
      languages: "any",
      maxAudioSeconds: 30,
    },
    async transcribe(req) {
      const body = new FormData();
      body.set(
        "file",
        new Blob([new Uint8Array(req.audio)], { type: req.mimeType }),
        `speech.${req.mimeType.split("/")[1] ?? "wav"}`,
      );
      body.set("model", o.model);
      body.set("mode", "codemix");
      body.set("language_code", req.language ? language(req.language) : "unknown");
      const start = performance.now();
      const r = await audioJson(o.fetch ?? fetch, "https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: { "api-subscription-key": o.apiKey },
        body,
        signal: req.signal,
      });
      if (typeof r?.transcript !== "string") throw new SpeeqError("PROVIDER_ERROR");
      const lang = typeof r.language_code === "string" ? baseLanguage(r.language_code) : undefined;
      return {
        text: r.transcript,
        language: lang === "od" ? "or" : lang,
        providerMs: performance.now() - start,
      };
    },
  };
}
/** @experimental Buffered Sarvam REST synthesis, always classified as paid. */
export function createSarvamTts(
  o: Options & { voices?: readonly VoiceInfo[]; defaultVoice?: string },
): TtsProvider {
  return {
    id: o.id ?? "sarvam-tts",
    kind: "remote-paid",
    capabilities: { streamingAudio: false, languages: "any", formats: ["wav"] },
    async listVoices() {
      return o.voices ?? [];
    },
    async synthesize(req) {
      if (req.format && req.format !== "wav") throw new SpeeqError("INVALID_INPUT");
      const r = await audioJson(o.fetch ?? fetch, "https://api.sarvam.ai/text-to-speech", {
        method: "POST",
        headers: { "api-subscription-key": o.apiKey, "content-type": "application/json" },
        signal: req.signal,
        body: JSON.stringify({
          text: req.text,
          language_code: language(req.language),
          model: o.model,
          speaker: req.voiceId ?? o.defaultVoice,
          pace: req.rate,
          output_audio_codec: "wav",
        }),
      });
      try {
        if (typeof r.audios?.[0] !== "string") throw Error();
        const bytes = Uint8Array.from(atob(r.audios[0]), (c) => c.charCodeAt(0));
        return {
          audio: new Blob([bytes]).stream(),
          mimeType: "audio/wav",
          ignored: (["pitch", "volume", "style"] as const).filter((k) => req[k] !== undefined),
        };
      } catch {
        throw new SpeeqError("PROVIDER_ERROR");
      }
    },
  };
}

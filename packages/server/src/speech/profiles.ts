import { SpeeqError, type SttProvider } from "@speeq/core";
import {
  createDetectThenTranscribe,
  createGeminiStt,
  createOpenAICompatibleStt,
  createOpenAICompatibleTts,
} from "@speeq/core/speech-http";
import type { SpeechConfig } from "../config.js";

// PROVISIONAL until ADR 0012 records measured routing decisions.
const routing = {
  cloud: { en: ["groq"], "en-IN": ["groq"], te: ["gemini"], hi: ["gemini"], default: ["groq"] },
  indic: { default: ["indic-stt"] },
};
type Options =
  | { profile: "browser" }
  | {
      profile: "free-cloud";
      groqApiKey: string;
      geminiApiKey: string;
      sttModels?: { groq?: string; gemini?: string };
    }
  | {
      profile: "self-hosted-indic";
      sttBaseURL: string;
      ttsBaseURL: string;
      token?: string;
      languageMode?: "fixed" | "auto";
      detector?: SttProvider;
    };
/** Build an explicit provider profile. Model defaults are read from server configuration. */
export function createSpeechConfig(o: Options): SpeechConfig | undefined {
  if (o.profile === "browser") return;
  if (o.profile === "free-cloud") {
    const groq = o.sttModels?.groq ?? process.env.GROQ_STT_MODEL,
      gemini = o.sttModels?.gemini ?? process.env.GEMINI_STT_MODEL;
    if (!o.groqApiKey || !o.geminiApiKey || !groq || !gemini)
      throw new SpeeqError("NOT_CONFIGURED", {
        message: "Supply both speech keys and configure both STT model IDs.",
      });
    return {
      stt: [
        createOpenAICompatibleStt({
          id: "groq",
          kind: "remote-free-tier",
          apiKey: o.groqApiKey,
          baseURL: "https://api.groq.com/openai/v1",
          model: groq,
        }),
        createGeminiStt({ id: "gemini", apiKey: o.geminiApiKey, model: gemini }),
      ],
      routing: { stt: structuredClone(routing.cloud) },
      policy: { allowRemote: true },
    };
  }
  if (!o.sttBaseURL || !o.ttsBaseURL) throw new SpeeqError("NOT_CONFIGURED");
  const transcriber = createOpenAICompatibleStt({
    id: "indic-stt",
    kind: "self-hosted",
    baseURL: o.sttBaseURL,
    model: "indic-stt",
    apiKey: o.token,
  });
  transcriber.capabilities.detectsLanguage = false;
  transcriber.capabilities.vocabulary = "none";
  let stt = transcriber;
  if (o.languageMode === "auto") {
    if (o.detector?.kind !== "self-hosted")
      throw new SpeeqError("NOT_CONFIGURED", {
        message: "Auto mode needs a self-hosted language detector.",
      });
    stt = createDetectThenTranscribe({
      id: transcriber.id,
      transcriber,
      detector: o.detector,
      candidates: ["te", "hi"],
    });
  }
  const tts = createOpenAICompatibleTts({
    id: "indic-tts",
    kind: "self-hosted",
    baseURL: o.ttsBaseURL,
    model: "indic-tts",
    apiKey: o.token,
    format: "wav",
    voices: [
      {
        id: "default",
        name: "Configured sidecar voice",
        languages: ["te", "hi", "en"],
        supports: { rate: false, pitch: false, volume: false, style: false },
      },
    ],
  });
  return {
    stt: [stt],
    tts: [tts],
    routing: { stt: structuredClone(routing.indic), tts: { default: [tts.id] } },
  };
}

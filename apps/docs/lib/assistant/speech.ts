import type { SpeechConfig } from "speeq/server";
import {
  createGeminiStt,
  createOpenAICompatibleStt,
  createOpenAICompatibleTts,
  createSarvamStt,
  createSarvamTts,
} from "speeq/speech";

/** Languages the multilingual voice mode offers. */
export const VOICE_LANGUAGES = ["en-US", "te-IN", "hi-IN"] as const;

/** Orpheus voices on Groq. Only used when GROQ_TTS_MODEL is set. */
const GROQ_VOICES = ["troy", "austin", "daniel", "autumn", "diana", "hannah"];

/**
 * Server speech for the multilingual voice mode.
 *
 * - English: Groq Whisper recognises it. If GROQ_TTS_MODEL is set (accept the model's terms in
 *   the Groq console first), Groq also speaks it; otherwise the browser voice does.
 * - Telugu and Hindi: Sarvam recognises and speaks them (SARVAM_API_KEY). Sarvam is a paid
 *   service with free credits, so the site opts in to `allowPaid` only when that key exists.
 * - Gemini is the free fallback for recognition (GEMINI_API_KEY).
 *
 * Returns `undefined` when no key is set, so the site keeps the browser voice.
 */
export function createSiteSpeech(
  env: Record<string, string | undefined>,
): SpeechConfig | undefined {
  const gemini = env.GEMINI_API_KEY?.trim();
  const groq = env.GROQ_API_KEY?.trim();
  const sarvam = env.SARVAM_API_KEY?.trim();
  if (!gemini && !groq && !sarvam) return undefined;

  const stt = [];
  const tts = [];
  const fallback: string[] = [];
  if (gemini) {
    const models = (env.GEMINI_STT_MODELS ?? "gemini-2.5-flash,gemini-3.1-flash-lite")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    for (const [i, model] of models.entries()) {
      const provider = createGeminiStt({ id: `gemini-${i}`, apiKey: gemini, model });
      stt.push(provider);
      fallback.push(provider.id);
    }
  }
  if (groq) {
    stt.push(
      createOpenAICompatibleStt({
        id: "groq",
        kind: "remote-free-tier",
        apiKey: groq,
        baseURL: "https://api.groq.com/openai/v1",
        model: env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo",
      }),
    );
  }
  if (sarvam) {
    stt.push(createSarvamStt({ id: "sarvam", apiKey: sarvam, model: env.SARVAM_STT_MODEL }));
    tts.push(
      createSarvamTts({
        id: "sarvam-tts",
        apiKey: sarvam,
        model: env.SARVAM_TTS_MODEL,
        defaultVoice: env.SARVAM_VOICE ?? "kavya",
      }),
    );
  }
  const english: string[] = [];
  if (groq) english.push("groq");
  english.push(...fallback);
  const indic: string[] = [];
  if (sarvam) indic.push("sarvam");
  indic.push(...fallback);
  const ttsRoutes: Record<string, string[]> = {};
  if (sarvam) ttsRoutes.default = ["sarvam-tts"];
  const groqTts = groq && env.GROQ_TTS_MODEL?.trim();
  if (groqTts) {
    tts.push(
      createOpenAICompatibleTts({
        id: "groq-tts",
        kind: "remote-free-tier",
        apiKey: groq,
        baseURL: "https://api.groq.com/openai/v1",
        model: groqTts,
        format: "wav",
        voices: GROQ_VOICES.map((id) => ({
          id,
          name: id[0]?.toUpperCase() + id.slice(1),
          languages: ["en"],
          supports: { rate: false, pitch: false, volume: false, style: false },
        })),
      }),
    );
    ttsRoutes.en = ["groq-tts"];
    ttsRoutes["en-US"] = ["groq-tts"];
  }

  return {
    stt,
    tts,
    routing: {
      stt: {
        default: indic.length ? indic : english,
        en: english,
        "en-IN": english,
        ...(sarvam ? { te: indic, hi: indic } : {}),
      },
      tts: ttsRoutes,
    },
    // Sarvam is paid, so it is only enabled because the site owner added its key.
    policy: { allowRemote: true, allowPaid: !!sarvam },
    limits: { transcribePerMinute: 12, synthesizePerMinute: 40, maxAudioSeconds: 30 },
  };
}

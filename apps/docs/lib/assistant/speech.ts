import type { SpeechConfig } from "speeq/server";
import { createGeminiStt, createOpenAICompatibleStt } from "speeq/speech";

/** Languages the multilingual voice mode offers. */
export const VOICE_LANGUAGES = ["en-US", "te-IN", "hi-IN"] as const;

/**
 * Server speech-to-text for the multilingual voice mode, on free tiers only.
 * - Gemini handles Telugu, Hindi and automatic language detection (models tried in order;
 *   override with GEMINI_STT_MODELS, comma separated).
 * - Groq Whisper is used first for English when GROQ_API_KEY is set (GROQ_STT_MODEL to change it).
 * Returns `undefined` without any key, so the site keeps the browser voice.
 */
export function createSiteSpeech(
  env: Record<string, string | undefined>,
): SpeechConfig | undefined {
  const gemini = env.GEMINI_API_KEY;
  const groq = env.GROQ_API_KEY;
  if (!gemini) return undefined;
  const models = (env.GEMINI_STT_MODELS ?? "gemini-2.5-flash,gemini-3.1-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const geminiStt = models.map((model, i) =>
    createGeminiStt({ id: `gemini-${i}`, apiKey: gemini, model }),
  );
  const geminiIds = geminiStt.map((p) => p.id);
  const whisper = groq
    ? createOpenAICompatibleStt({
        id: "groq",
        kind: "remote-free-tier",
        apiKey: groq,
        baseURL: "https://api.groq.com/openai/v1",
        model: env.GROQ_STT_MODEL ?? "whisper-large-v3-turbo",
      })
    : undefined;
  return {
    stt: whisper ? [whisper, ...geminiStt] : geminiStt,
    routing: {
      stt: {
        default: geminiIds,
        ...(whisper ? { en: ["groq", ...geminiIds], "en-IN": ["groq", ...geminiIds] } : {}),
      },
    },
    policy: { allowRemote: true },
    limits: { transcribePerMinute: 12, maxAudioSeconds: 30 },
  };
}

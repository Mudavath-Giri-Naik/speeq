import { createGeminiProvider } from "@speeq/llm-gemini";
import { createOpenAICompatibleProvider } from "@speeq/llm-openai-compatible";
import { repo } from "./data/repository";
import { createDemoMockLlm } from "./mock-rules";

/** Demo provider mode shown by the app. */
export type LlmMode = "groq" | "gemini" | "mock";

function llmPreference(env: Record<string, string | undefined>) {
  const configured = env.SPEEQ_LLM?.trim();
  const groqKey = env.GROQ_API_KEY?.trim();
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const preferred: LlmMode =
    configured === "groq" || configured === "gemini" || configured === "mock"
      ? configured
      : groqKey
        ? "groq"
        : geminiKey
          ? "gemini"
          : "mock";
  return { preferred, groqKey, geminiKey };
}

/** Reports the usable provider mode without initializing a provider. */
export function getLlmMode(env: Record<string, string | undefined>): LlmMode {
  const { preferred, groqKey, geminiKey } = llmPreference(env);
  if ((preferred === "groq" && !groqKey) || (preferred === "gemini" && !geminiKey)) return "mock";
  return preferred;
}

/** Selects the configured provider without contacting it. */
export function selectLlm(env: Record<string, string | undefined>, delayMs = 15) {
  const { preferred, groqKey, geminiKey } = llmPreference(env);
  if (preferred === "groq" && groqKey)
    return {
      mode: preferred,
      provider: createOpenAICompatibleProvider({
        baseURL: env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
        apiKey: groqKey,
        model: env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
      }),
    };
  if (preferred === "gemini" && geminiKey)
    return {
      mode: preferred,
      provider: createGeminiProvider({
        apiKey: geminiKey,
        model: env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
      }),
    };
  if (preferred !== "mock") console.warn(`[demo] ${preferred} has no API key. Using mock mode.`);
  return { mode: "mock" as const, provider: createDemoMockLlm({ repo, delayMs }) };
}

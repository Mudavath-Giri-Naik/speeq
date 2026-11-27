/** An environment variable a feature or provider reads. Values are never written by speeq. */
export interface EnvVar {
  name: string;
  note: string;
}
/** A language-model provider the generated config can use. Data only. */
export interface ProviderEntry {
  id: "mock" | "groq" | "gemini" | "openrouter" | "openai-compatible";
  label: string;
  needsKey: boolean;
  /** Module specifier (from the umbrella package) and exported names used by `expression`. */
  imports: { from: string; names: string[] }[];
  /** TypeScript expression creating the provider. Model ids and keys come from env only. */
  expression: string;
  env: EnvVar[];
  note: string;
}
/** How the assistant listens and speaks. Data only. */
export interface VoiceEntry {
  id: "none" | "browser" | "cloud" | "sarvam";
  label: string;
  /** Module specifier and names the generated config imports. */
  imports: { from: string; names: string[] }[];
  /** Lines added to the `createSpeeq` options. */
  config: string[];
  env: EnvVar[];
  note: string;
}
/** An optional feature of the generated config. Data only. */
export interface FeatureEntry {
  id: "voice" | "audit" | "confirmation" | "telemetry" | "ui-bridge";
  label: string;
  defaultOn: boolean;
  /** Lines added to the `createSpeeq` options when enabled. */
  config: string[];
  env: EnvVar[];
  note: string;
}

/** Providers, in menu order. `mock` needs no key. */
export const PROVIDERS: readonly ProviderEntry[] = [
  {
    id: "mock",
    label: "Mock (no key, canned replies)",
    needsKey: false,
    imports: [{ from: "speeq/testing", names: ["createMockLLMProvider"] }],
    expression: `createMockLLMProvider({
    rules: [],
    fallback: () => ({
      text: "I am running in mock mode. Set the SPEEQ_LLM_* variables and switch the provider to connect a real model.",
    }),
  })`,
    env: [],
    note: "Good for a first run. It does not call tools by itself.",
  },
  {
    id: "groq",
    label: "Groq (free tier, fast)",
    needsKey: true,
    imports: [{ from: "speeq/llm-openai-compatible", names: ["createOpenAICompatibleProvider"] }],
    expression: `createOpenAICompatibleProvider({
    baseURL: process.env.SPEEQ_LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.SPEEQ_LLM_MODEL ?? "",
  })`,
    env: [
      { name: "GROQ_API_KEY", note: "Groq API key from console.groq.com" },
      {
        name: "SPEEQ_LLM_MODEL",
        note: "A Groq model id from console.groq.com/docs/models (they change often)",
      },
    ],
    note: "Free tier. Create a key at console.groq.com.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    needsKey: true,
    imports: [{ from: "speeq/llm-gemini", names: ["createGeminiProvider"] }],
    expression: `createGeminiProvider({
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.SPEEQ_LLM_MODEL ?? "",
  })`,
    env: [
      { name: "GEMINI_API_KEY", note: "Google AI Studio key" },
      { name: "SPEEQ_LLM_MODEL", note: "Gemini model id" },
    ],
    note: "Google AI Studio has a free tier.",
  },
  {
    id: "openrouter",
    label: "OpenRouter (many models, some free)",
    needsKey: true,
    imports: [{ from: "speeq/llm-openai-compatible", names: ["createOpenAICompatibleProvider"] }],
    expression: `createOpenAICompatibleProvider({
    baseURL: process.env.SPEEQ_LLM_BASE_URL ?? "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.SPEEQ_LLM_MODEL ?? "",
  })`,
    env: [
      { name: "OPENROUTER_API_KEY", note: "OpenRouter API key from openrouter.ai/keys" },
      { name: "SPEEQ_LLM_MODEL", note: "A model id from openrouter.ai/models" },
    ],
    note: "One key, many models.",
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible (Groq, OpenRouter, Ollama, ...)",
    needsKey: true,
    imports: [{ from: "speeq/llm-openai-compatible", names: ["createOpenAICompatibleProvider"] }],
    expression: `createOpenAICompatibleProvider({
    baseURL: process.env.SPEEQ_LLM_BASE_URL ?? "",
    apiKey: process.env.SPEEQ_LLM_API_KEY,
    model: process.env.SPEEQ_LLM_MODEL ?? "",
  })`,
    env: [
      { name: "SPEEQ_LLM_BASE_URL", note: "API base URL, e.g. https://api.groq.com/openai/v1" },
      { name: "SPEEQ_LLM_API_KEY", note: "API key (optional for local servers)" },
      { name: "SPEEQ_LLM_MODEL", note: "Model id; free-tier ids change often" },
    ],
    note: "Several providers have a free tier.",
  },
];
/** Voice choices, in menu order. Browser voice needs no key. */
export const VOICES: readonly VoiceEntry[] = [
  {
    id: "browser",
    label: "Browser voice (no key, Chrome and Edge)",
    imports: [],
    config: [],
    env: [],
    note: "Speech recognition and speech output run in the visitor's browser.",
  },
  {
    id: "cloud",
    label: "Cloud speech to text (Groq and Gemini free tiers)",
    imports: [{ from: "speeq/server", names: ["createSpeechConfig"] }],
    config: [
      "  // Falls back to browser voice until all four variables are set.",
      "  speech:",
      "    process.env.GROQ_API_KEY &&",
      "    process.env.GEMINI_API_KEY &&",
      "    process.env.GROQ_STT_MODEL &&",
      "    process.env.GEMINI_STT_MODEL",
      '      ? createSpeechConfig({ profile: "free-cloud", groqApiKey: process.env.GROQ_API_KEY, geminiApiKey: process.env.GEMINI_API_KEY })',
      "      : undefined,",
    ],
    env: [
      { name: "GROQ_API_KEY", note: "Groq API key (speech to text)" },
      { name: "GEMINI_API_KEY", note: "Google AI Studio key (speech to text, Telugu and Hindi)" },
      { name: "GROQ_STT_MODEL", note: "Groq speech-to-text model id" },
      { name: "GEMINI_STT_MODEL", note: "Gemini speech-to-text model id" },
    ],
    note: "Better recognition for Indian languages. Needs keys.",
  },
  {
    id: "sarvam",
    label: "Sarvam AI voice (paid credits, best for Indian languages)",
    imports: [{ from: "speeq/speech", names: ["createSarvamStt", "createSarvamTts"] }],
    config: [
      "  // Sarvam speech uses your paid Sarvam credits. Falls back to browser voice without a key.",
      "  speech: process.env.SARVAM_API_KEY",
      "    ? {",
      "        stt: [createSarvamStt({ apiKey: process.env.SARVAM_API_KEY })],",
      '        tts: [createSarvamTts({ apiKey: process.env.SARVAM_API_KEY, defaultVoice: "aditya" })],',
      '        routing: { stt: { default: ["sarvam-stt"] }, tts: { default: ["sarvam-tts"] } },',
      "        policy: { allowRemote: true, allowPaid: true },",
      "      }",
      "    : undefined,",
    ],
    env: [
      {
        name: "SARVAM_API_KEY",
        note: "Sarvam AI key (speech to text and text to speech; uses paid credits)",
      },
    ],
    note: "Telugu, Hindi and 9 more languages. New accounts get free credits, then it is paid.",
  },
  {
    id: "none",
    label: "No voice (text only)",
    imports: [],
    config: [],
    env: [],
    note: "A plain text chat box.",
  },
];
/** Look a voice choice up by id. */
export function voice(id: string): VoiceEntry | undefined {
  return VOICES.find((v) => v.id === id);
}
/** Optional features, in menu order. */
export const FEATURES: readonly FeatureEntry[] = [
  {
    id: "confirmation",
    label: "Confirm before write actions",
    defaultOn: true,
    config: [],
    env: [],
    note: "Always on: write tools ask first unless a decision sets confirm: false.",
  },
  {
    id: "audit",
    label: "Audit log (admin only)",
    defaultOn: true,
    config: [
      "  audit: {",
      "    // Replace with your own admin check. Without authorize the audit routes return 404.",
      "    authorize: () => false,",
      "    retentionDays: 30,",
      "  },",
    ],
    env: [],
    note: "Conversation events are stored in your own store.",
  },
  {
    id: "telemetry",
    label: "Anonymous adoption counters",
    defaultOn: true,
    config: ["  telemetry: { enabled: true },"],
    env: [],
    note: "Counters only; no conversation content. SPEEQ_TELEMETRY=0 turns it off.",
  },
  {
    id: "voice",
    label: "Voice (browser speech)",
    defaultOn: false,
    config: [],
    env: [],
    note: "Client-side only: enable it on the SpeeqProvider. No server change.",
  },
  {
    id: "ui-bridge",
    label: "UI actions (the agent asks the page to do things)",
    defaultOn: false,
    config: [
      "  uiActions: [], // add defineUiAction(...) entries; mount handlers with useSpeeqAction",
    ],
    env: [],
    note: "Server-declared, page-executed, confirmable. See docs: UI actions.",
  },
];
/** Look a provider up by id. */
export function provider(id: string): ProviderEntry | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** An environment variable a feature or provider reads. Values are never written by speeq. */
export interface EnvVar {
  name: string;
  note: string;
}
/** A language-model provider the generated config can use. Data only. */
export interface ProviderEntry {
  id: "mock" | "openai-compatible" | "gemini";
  label: string;
  needsKey: boolean;
  /** Module specifier (from the umbrella package) and exported names used by `expression`. */
  imports: { from: string; names: string[] }[];
  /** TypeScript expression creating the provider. Model ids and keys come from env only. */
  expression: string;
  env: EnvVar[];
  note: string;
}
/** An optional feature of the generated config. Data only. */
export interface FeatureEntry {
  id: "voice" | "audit" | "confirmation" | "telemetry";
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
];
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
];
/** Look a provider up by id. */
export function provider(id: string): ProviderEntry | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

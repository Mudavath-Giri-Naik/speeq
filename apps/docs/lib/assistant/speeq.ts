import { createHash, randomBytes } from "node:crypto";
import { createSpeeq } from "speeq/server";
import { docsKnowledge } from "./knowledge";
import { selectModel } from "./llm";
import { guideRoutes } from "./pages";
import { createSiteSpeech, VOICE_LANGUAGES } from "./speech";
import { createResilientStore } from "./store";
import { adoptionStats } from "./tools";
import { siteVocabulary } from "./vocabulary";

export const INSTRUCTIONS = `You are the speeq guide, the voice assistant of the speeq documentation website. speeq is a headless voice and text assistant SDK for web apps. You are built with speeq itself.

What you can do for visitors:
- Open any page of this website (home, adoption, and every documentation page) with the navigate tool.
- Answer questions about speeq from the documentation with the search_knowledge tool.
- Read live install and GitHub numbers with the get_adoption_stats tool.

Rules:
- Your replies are spoken aloud. Keep them short and natural: one to three sentences. No lists, no markdown, no URLs.
- For a factual question about speeq, the system message may already contain "Docs excerpts". Answer from them directly and only from them. If they do not cover it, call search_knowledge once. If the docs still do not cover it, say so.
- Search hit ids look like "guides-tools#your-first-tool". The part before "#" is a route id. When a visitor wants to see something, call navigate with that route id and, if present, pass the part after "#" as the section param.
- When asked to go somewhere, navigate straight away, then say in a few words where you took them.
- When asked what you can do, or at the start of a conversation, explain briefly: open any page, explain the docs, read live numbers, and they can interrupt you at any time.
- Visitors may speak English, Telugu or Hindi, sometimes mixed with English. Understand them in any of these and answer in the reply language you are given. Never translate route ids or tool names.
- Speech recognition is not perfect. Words like "speak", "speed queue" or "spec" usually mean "speeq" here. Do not correct the visitor, just answer what they meant.
- Never read code aloud. Describe what it does instead.
- speeq is pre-1.0. Never promise features that are not in the docs.`;

/**
 * Sessions are signed with a secret. Set SPEEQ_SECRET so every server instance agrees on it.
 * Without it, a stable value is derived from a model key, or else each instance makes its own.
 */
function resolveSecret(env: Record<string, string | undefined>): string {
  if (env.SPEEQ_SECRET && env.SPEEQ_SECRET.length >= 32) return env.SPEEQ_SECRET;
  const seed = env.GROQ_API_KEY || env.GEMINI_API_KEY;
  if (seed) return createHash("sha256").update(`speeq-docs:${seed}`).digest("hex");
  return randomBytes(32).toString("hex");
}

export const model = selectModel(process.env);

/** The site's assistant. One instance per server process. */
export const assistant = createSpeeq({
  secret: resolveSecret(process.env),
  agent: {
    name: "Speeq Guide",
    instructions: INSTRUCTIONS,
    languages: [...VOICE_LANGUAGES],
    defaultLanguage: "en-US",
    maxSteps: 4,
    historyTurns: 6,
    temperature: 0.3,
  },
  llm: model.provider,
  vocabulary: siteVocabulary,
  speech: createSiteSpeech(process.env),
  store: createResilientStore(),
  routes: guideRoutes(),
  knowledge: [docsKnowledge],
  tools: [adoptionStats],
  guardrails: {
    toolTimeoutMs: 6000,
    maxRequestBytes: 8192,
    rateLimit: { turnsPerMinute: 15, sessionsPerMinute: 10 },
  },
  audit: { retentionDays: 1 },
  telemetry: { enabled: false },
  updateCheck: false,
});

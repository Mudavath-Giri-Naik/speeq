import type { LLMProvider } from "speeq/core";
import { createGeminiProvider } from "speeq/llm-gemini";
import { createOpenAICompatibleProvider } from "speeq/llm-openai-compatible";
import { createMockLLMProvider } from "speeq/testing";
import { INTRO } from "./intro";
import { findPage, guidePages } from "./pages";

function decode(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
const num = (n: unknown) => (typeof n === "number" ? n.toLocaleString("en-US") : null);

function firstSentences(text: string, max = 260): string {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).length > max && out) break;
    out += sentence;
  }
  return out.trim().slice(0, max + 80);
}

/**
 * A small rule-based model for when no API key is set. It does real work through speeq tools:
 * it opens pages, searches the docs and reads the live numbers. A real model, when configured,
 * understands much more.
 */
function createOfflineGuide(): LLMProvider {
  return createMockLLMProvider({
    rules: [
      {
        match:
          /what can you do|what do you do|how can you help|your capabilities|who are you|what are you|introduce yourself|how do you work|^help$|^help me$/,
        respond: () => ({ text: INTRO }),
      },
      {
        match: /^(hi|hello|hey|good (morning|afternoon|evening))\b[\s\S]{0,20}$/,
        respond: () => ({ text: `Hi! ${INTRO}` }),
      },
      {
        match: /^(thanks|thank you|cool|great|nice|ok|okay)\b[\s\S]{0,20}$/,
        respond: () => ({ text: "Happy to help. Ask me anything else about speeq." }),
      },
      {
        match: ({ normalized }) =>
          /\b(open|go to|goto|take me to|take me|navigate to|show me|bring me to|jump to|head to|switch to|scroll to)\b/.test(
            normalized,
          ) && findPage(normalized) !== null,
        respond: ({ normalized }) => {
          const page = findPage(normalized);
          return page
            ? { toolCalls: [{ name: "navigate", arguments: { routeId: page.id } }] }
            : { text: "Which page would you like?" };
        },
      },
      {
        match:
          /\b(installs?|downloads?|stars?|popular|adoption|latest version|current version|what version|how many people)\b/,
        respond: ({ hasTool }) =>
          hasTool("get_adoption_stats")
            ? { toolCalls: [{ name: "get_adoption_stats", arguments: {} }] }
            : { text: "I can't read the numbers right now. Open the Adoption page to see them." },
      },
    ],
    fallback: ({ text, hasTool }) =>
      hasTool("search_knowledge")
        ? { toolCalls: [{ name: "search_knowledge", arguments: { query: text } }] }
        : { text: "Sorry, I can't search the docs right now." },
    afterTool: ({ toolName, result }) => {
      const data = record(decode(result));
      if (data.error) return { text: "Sorry, that didn't work. Please try again." };
      if (toolName === "navigate") {
        const opened = typeof data.opened === "string" ? data.opened : "that page";
        return { text: `Opening ${opened}.` };
      }
      if (toolName === "get_adoption_stats") {
        const parts: string[] = [];
        const week = num(data.installsLastWeek);
        const all = num(data.installsAllTime);
        const stars = num(data.githubStars);
        if (data.latestVersion) parts.push(`The latest version is ${String(data.latestVersion)}.`);
        if (week !== null) parts.push(`There were ${week} installs last week.`);
        if (all !== null) parts.push(`${all} installs in total.`);
        if (stars !== null) parts.push(`The repository has ${stars} GitHub stars.`);
        return {
          text: parts.length
            ? `${parts.join(" ")} npm numbers update about once a day.`
            : "The numbers aren't available right now. Please try again in a moment.",
        };
      }
      if (toolName === "search_knowledge") {
        const results = Array.isArray(data.results) ? (data.results as unknown[]) : [];
        const top = record(results[0]);
        if (typeof top.content !== "string")
          return {
            text: "I couldn't find that in the docs. Try asking about tools, voice, privacy, or how to install.",
          };
        const title = typeof top.title === "string" ? top.title : "the docs";
        return { text: `From ${title}. ${firstSentences(top.content)}` };
      }
      return { text: "Done." };
    },
  });
}

/** Which model answers. A key in the environment turns on a real model. */
export function selectModel(env: Record<string, string | undefined>): {
  mode: "groq" | "gemini" | "offline";
  provider: LLMProvider;
} {
  const preferred = env.SPEEQ_LLM?.trim();
  const groq = env.GROQ_API_KEY?.trim();
  const gemini = env.GEMINI_API_KEY?.trim();
  if (groq && (!preferred || preferred === "groq" || (preferred === "gemini" && !gemini))) {
    return {
      mode: "groq",
      provider: createOpenAICompatibleProvider({
        baseURL: env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
        apiKey: groq,
        model: env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
      }),
    };
  }
  if (gemini && preferred !== "offline") {
    return {
      mode: "gemini",
      provider: createGeminiProvider({
        apiKey: gemini,
        model: env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      }),
    };
  }
  return { mode: "offline", provider: createOfflineGuide() };
}

export const guideTitles = () => guidePages().map((p) => p.title);

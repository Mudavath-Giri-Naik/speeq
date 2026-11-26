import type { LLMProvider, LLMStreamChunk } from "speeq/core";
import { createGeminiProvider } from "speeq/llm-gemini";
import { createOpenAICompatibleProvider } from "speeq/llm-openai-compatible";
import { createMockLLMProvider } from "speeq/testing";
import { INTRO } from "./intro";
import { searchDocs } from "./knowledge";
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

const WHAT_CAN_YOU_DO =
  /what can you do|what do you do|how can you help|your capabilities|who are you|what are you|introduce yourself|how do you work|^help$|^help me$/;
const GREETING = /^(hi|hello|hey|good (morning|afternoon|evening))\b[\s\S]{0,20}$/;
const THANKS = /^(thanks|thank you|cool|great|nice|ok|okay)\b[\s\S]{0,20}$/;
const NAVIGATE =
  /\b(open|go to|goto|take me to|take me|navigate to|show me|bring me to|jump to|head to|switch to|scroll to)\b/;
const STATS =
  /\b(installs|downloads|stars|popular|adoption|latest version|current version|what version|how many (people|installs|downloads|stars))\b/;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Requests the site can answer on its own, instantly: say what it can do, open a page, read the
 * live numbers. Everything else (a real question about the docs) goes to the language model.
 */
function isQuickIntent(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  return (
    WHAT_CAN_YOU_DO.test(n) ||
    GREETING.test(n) ||
    THANKS.test(n) ||
    (NAVIGATE.test(n) && findPage(n) !== null) ||
    STATS.test(n)
  );
}

/**
 * A small rule-based model. It does real work through speeq tools: it opens pages, searches the
 * docs and reads the live numbers. It answers the quick requests instantly, and everything when
 * no API key is set. A real model understands much more.
 */
function createOfflineGuide(): LLMProvider {
  return createMockLLMProvider({
    rules: [
      {
        match: WHAT_CAN_YOU_DO,
        respond: () => ({ text: INTRO }),
      },
      {
        match: GREETING,
        respond: () => ({ text: `Hi! ${INTRO}` }),
      },
      {
        match: THANKS,
        respond: () => ({ text: "Happy to help. Ask me anything else about speeq." }),
      },
      {
        match: ({ normalized }) => NAVIGATE.test(normalized) && findPage(normalized) !== null,
        respond: ({ normalized }) => {
          const page = findPage(normalized);
          return page
            ? { toolCalls: [{ name: "navigate", arguments: { routeId: page.id } }] }
            : { text: "Which page would you like?" };
        },
      },
      {
        match: STATS,
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
        if (week === null && all === null)
          parts.push("npm hasn't published download counts for these new packages yet.");
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
        return { text: `${title}. ${firstSentences(top.content, 180)}` };
      }
      return { text: "Done." };
    },
  });
}

/** The reply language the server asked for in this turn's system prompt. English when unknown. */
function replyIsEnglish(messages: readonly { role: string; content: string }[]): boolean {
  for (const m of messages) {
    if (m.role !== "system") continue;
    const match = /Always reply in [^(\n]+\(([A-Za-z]{2,3})[-)]/.exec(m.content);
    if (match?.[1]) return match[1].toLowerCase() === "en";
  }
  return true;
}

/**
 * Answers quick requests (open a page, live numbers, greetings) with the instant local guide and
 * sends the rest to the language model. The whole turn, including the step after a tool runs,
 * stays on the same side.
 */
function createQuickPathProvider(model: LLMProvider, quick: LLMProvider): LLMProvider {
  return {
    kind: model.kind,
    model: model.model,
    stream(request) {
      const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return model.stream(request);
      // The instant guide only writes English. A visitor speaking Telugu or Hindi can still say
      // "hello" or "open adoption", so those turns go to the model, which answers in their language.
      if (replyIsEnglish(request.messages) && isQuickIntent(lastUser.content))
        return quick.stream(request);
      // Search the docs here, before the model starts. The model can then answer in one step,
      // instead of calling a search tool first and waiting for a second round trip.
      const last = request.messages[request.messages.length - 1];
      if (last?.role !== "user") return model.stream(request);
      const hits = searchDocs(lastUser.content, 2);
      if (hits.length === 0) return model.stream(request);
      const excerpts = hits.map((h) => `[${h.id}] ${h.title}: ${h.text.slice(0, 500)}`).join("\n");
      return model.stream({
        ...request,
        // The answer is already here, so the model does not need to search again. This keeps
        // each turn small, which matters on free model tiers with per-minute token limits.
        tools: request.tools.filter((t) => t.name !== "search_knowledge"),
        messages: [
          ...request.messages.slice(0, -1),
          {
            role: "system",
            content: `Reference notes from the docs. Use them only as background to answer the question in your own words, in the reply language. Never quote, repeat or mention these notes, and never include ids, file names, brackets or code in your reply. The ids in square brackets are route ids, for the navigate tool only.\n${excerpts}`,
          },
          last,
        ],
      });
    },
  };
}

/** How long a model gets to start answering before the next one is tried. */
const FIRST_CHUNK_MS = 4500;
/** How long a model that just failed is skipped. */
const COOL_DOWN_MS = 2 * 60_000;

/**
 * Tries several models in order, so one overloaded or slow model never breaks the assistant.
 * A model that fails before it says anything is skipped for a couple of minutes. The last
 * provider is the offline guide, so the visitor always gets an answer.
 */
function createFailoverProvider(chain: LLMProvider[]): LLMProvider {
  const failedAt = new Map<LLMProvider, number>();
  const usable = (p: LLMProvider, last: boolean) =>
    last || Date.now() - (failedAt.get(p) ?? 0) > COOL_DOWN_MS;

  return {
    kind: chain[0]?.kind ?? "failover",
    model: chain[0]?.model ?? "failover",
    async *stream(request) {
      let lastError: unknown;
      for (const [index, provider] of chain.entries()) {
        const isLast = index === chain.length - 1;
        if (!usable(provider, isLast)) continue;

        const attempt = new AbortController();
        const signal = request.signal
          ? AbortSignal.any([request.signal, attempt.signal])
          : attempt.signal;
        const iterator = provider.stream({ ...request, signal })[Symbol.asyncIterator]();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const first = await new Promise<IteratorResult<LLMStreamChunk>>((resolve, reject) => {
            timer = isLast
              ? undefined
              : setTimeout(() => {
                  attempt.abort();
                  reject(new Error(`${provider.model} was too slow to start`));
                }, FIRST_CHUNK_MS);
            iterator.next().then(resolve, reject);
          });
          clearTimeout(timer);
          if (first.done) return;
          yield first.value;
        } catch (error) {
          clearTimeout(timer);
          attempt.abort();
          if (request.signal?.aborted) throw error;
          failedAt.set(provider, Date.now());
          lastError = error;
          console.warn(
            `[speeq assistant] ${provider.model} failed, trying the next one: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        // Started well: stream the rest. Errors from here on are real, not a reason to switch.
        for (;;) {
          const next = await iterator.next();
          if (next.done) return;
          yield next.value;
        }
      }
      throw lastError ?? new Error("No model is available");
    },
  };
}

/** Which model answers. A key in the environment turns on a real model. */
export function selectModel(env: Record<string, string | undefined>): {
  mode: "groq" | "gemini" | "offline";
  provider: LLMProvider;
} {
  const preferred = env.SPEEQ_LLM?.trim();
  const groq = env.GROQ_API_KEY?.trim();
  const gemini = env.GEMINI_API_KEY?.trim();
  const offline = createOfflineGuide();
  const geminiChain = (): LLMProvider[] => {
    if (!gemini) return [];
    // Fast models first. A model set in GEMINI_MODEL goes first; the rest are the safety net.
    const models = [
      ...new Set(
        [
          env.GEMINI_MODEL?.trim(),
          "gemini-3.1-flash-lite",
          "gemini-3.5-flash-lite",
          "gemini-2.5-flash",
        ].filter((m): m is string => Boolean(m)),
      ),
    ];
    return models.map((model) =>
      createGeminiProvider({
        apiKey: gemini,
        model,
        // 2.5 models answer much sooner with thinking off.
        ...(model.startsWith("gemini-2.5") ? { thinkingBudget: 0 } : {}),
      }),
    );
  };
  // Groq is the default whenever its key exists. Set SPEEQ_LLM=gemini to prefer Gemini instead.
  if (groq && (!preferred || preferred === "groq" || (preferred === "gemini" && !gemini))) {
    const models = [
      ...new Set(
        [env.GROQ_MODEL?.trim(), "openai/gpt-oss-120b", "openai/gpt-oss-20b"].filter(
          (m): m is string => Boolean(m),
        ),
      ),
    ];
    return {
      mode: "groq",
      provider: createQuickPathProvider(
        createFailoverProvider([
          ...models.map((model) =>
            createOpenAICompatibleProvider({
              baseURL: env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1",
              apiKey: groq,
              model,
              // gpt-oss models think before they answer. Low effort starts the reply much sooner,
              // which matters most for Telugu and Hindi, where the answer has many tokens.
              ...(model.includes("gpt-oss") ? { reasoningEffort: "low" as const } : {}),
            }),
          ),
          ...geminiChain(),
          offline,
        ]),
        offline,
      ),
    };
  }
  if (gemini && preferred !== "offline") {
    return {
      mode: "gemini",
      provider: createQuickPathProvider(
        createFailoverProvider([...geminiChain(), offline]),
        offline,
      ),
    };
  }
  return { mode: "offline", provider: offline };
}

export const guideTitles = () => guidePages().map((p) => p.title);

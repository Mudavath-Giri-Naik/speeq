import { createMockLLMProvider, type MockAfterToolInput, type MockRuleInput } from "@speeq/testing";
import { z } from "zod";
import type { QuestionRepository } from "./data/repository";
import { localizedReply } from "./mock-replies";

const bookmark = /bookmark|బుక్[‌ ]?మార్క్|बुकमार्क/u;
const count = /how many|\bcount\b|ఎన్ని|कितने/u;
const topics = /topics|అంశాలు|विषय सूची/u;
const navigation = /go to|take me|\bopen\b|\bshow\b|తీసుకెళ్ళు|చూపించు|తెరువు|ले चलो|खोलो|दिखाओ/u;
const textSize = /\b(?:larger|bigger|large)\s+text\b|\btext\s+(?:size|larger|bigger)\b/u;
const normalText = /\b(?:normal|smaller|regular)\s+text\b/u;
const resetPrefs = /\breset\s+(?:my\s+)?(?:preferences|settings)\b/u;
const knowledge = /tell me about|what is|explain|గురించి|के बारे में/u;

const pages = [
  ["pricing", /pricing|price|plans|ధరలు|ధర|कीमतें|कीमत|प्राइसिंग/u],
  ["practice", /practice|ప్రాక్టీస్|अभ्यास/u],
  ["subjects", /subjects|విషయాలు|विषय/u],
  ["about", /about|గురించి|परिचय/u],
  ["home", /home|హోమ్|होम/u],
  ["login", /login|sign in|సైన్ ఇన్|साइन इन/u],
] as const;

// JavaScript's word boundary is ASCII-based, so use Unicode letters and marks for all three languages.
const pageWords = pages.map(([id, alias]) => ({
  id,
  pattern: new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}])(${alias.source})(?![\\p{L}\\p{M}\\p{N}])`, "u"),
}));

const contextId = z.object({
  data: z.object({ questionId: z.union([z.number().int(), z.string().regex(/^\d+$/)]) }),
});

function firstSystem({ messages }: MockRuleInput["request"]) {
  return messages.find((message) => message.role === "system")?.content ?? "";
}

function decode(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function inContext(system: string) {
  const json = system.match(/<page_context>\s*([\s\S]*?)\s*<\/page_context>/)?.[1];
  if (!json) return undefined;
  const parsed = contextId.safeParse(decode(json));
  return parsed.success ? Number(parsed.data.data.questionId) : undefined;
}

function tool(name: string, args: Record<string, unknown>) {
  return { toolCalls: [{ name, arguments: args }] };
}

function afterTool(repo: QuestionRepository, { toolName, result, request }: MockAfterToolInput) {
  const { text, name } = localizedReply(firstSystem(request));
  const reply = (value: string) => ({ text: value });
  if (toolName.startsWith("ui_")) {
    const status = z.object({ status: z.string() }).safeParse(decode(result));
    if (status.success && status.data.status === "done") return reply("Done.");
    if (status.success && status.data.status === "declined")
      return reply("Okay, I did not change anything.");
    return reply("I could not do that on this page.");
  }
  const data = z.record(z.string(), z.unknown()).safeParse(decode(result));
  if (!data.success) return reply(text.failure(result || text.unknown));
  const values = data.data;
  if (values.declined) return reply(text.declined);
  if (values.error) {
    const issue = z.union([z.string(), z.object({ message: z.string() })]).safeParse(values.error);
    return reply(
      text.failure(
        issue.success
          ? typeof issue.data === "string"
            ? issue.data
            : issue.data.message
          : text.unknown,
      ),
    );
  }
  switch (toolName) {
    case "navigate": {
      const title = typeof values.opened === "string" ? values.opened : "";
      return reply(text.opening(text.titles[title as keyof typeof text.titles] ?? title));
    }
    case "count_questions": {
      const filter = z.object({ subject: z.string().optional() }).safeParse(values.filter);
      if (typeof values.count !== "number") break;
      const slug = filter.success ? filter.data.subject : undefined;
      return reply(text.count(values.count, slug ? repo.getSubject(slug)?.name[name] : undefined));
    }
    case "list_topics": {
      const items = z.array(z.object({ name: z.string() })).safeParse(values.topics);
      if (items.success)
        return reply(text.topics(items.data.map((topic) => topic.name).join(", ")));
      break;
    }
    case "search_knowledge": {
      const items = z.array(z.object({ content: z.string() })).safeParse(values.results);
      return reply((items.success && items.data[0]?.content.slice(0, 300)) || text.noResults);
    }
    case "bookmark_question":
      if (typeof values.questionId === "number") return reply(text.bookmarked(values.questionId));
      break;
    case "list_bookmarks": {
      const ids = z.array(z.number()).safeParse(values.bookmarks);
      if (!values.signedIn) return reply(text.signIn);
      return reply(
        ids.success && ids.data.length ? text.bookmarks(ids.data.join(", ")) : text.emptyBookmarks,
      );
    }
    default:
      return reply(text.help);
  }
  return reply(text.failure(text.unknown));
}

/** Creates the demo's deterministic English, Telugu and Hindi assistant. */
export function createDemoMockLlm({
  repo,
  delayMs,
}: {
  repo: QuestionRepository;
  delayMs: number;
}) {
  const subjectFor = (text: string) =>
    repo
      .listSubjects()
      .find(({ slug, name }) =>
        [slug, ...Object.values(name)].some((alias) =>
          text.includes(alias.toLowerCase().normalize("NFC")),
        ),
      );
  return createMockLLMProvider({
    delayMs,
    rules: [
      {
        match: () => true,
        respond(input) {
          const query = input.normalized
            .normalize("NFC")
            .replace(/[?!.।]+$/, "")
            .trim();
          const system = firstSystem(input.request);
          const { text } = localizedReply(system);
          const subject = subjectFor(query);
          if (resetPrefs.test(query)) return tool("ui_reset_preferences", {});
          if (normalText.test(query)) return tool("ui_set_text_size", { size: "normal" });
          if (textSize.test(query)) return tool("ui_set_text_size", { size: "large" });
          if (bookmark.test(query)) {
            if (/list|show (?:my |the )?bookmarks|my bookmarks|నా బుక్‌మార్క్|मेरे बुकमार्क/u.test(query))
              return tool("list_bookmarks", {});
            const number = query.match(/\d+/)?.[0];
            const id = number === undefined ? inContext(system) : Number(number);
            return id === undefined
              ? { text: text.openQuestion }
              : tool("bookmark_question", { questionId: id });
          }
          if (count.test(query))
            return tool("count_questions", subject ? { subject: subject.slug } : {});
          if (topics.test(query) && subject) return tool("list_topics", { subject: subject.slug });
          const command = navigation.test(query);
          const question = query.match(/(?:question|ప్రశ్న|प्रश्न)\s+(\d{1,4})\b/u);
          if (question?.[1] && (command || question[0] === query))
            return tool("navigate", { routeId: "question", params: { id: question[1] } });
          const page = pageWords.find(({ pattern }) => {
            const word = pattern.exec(query)?.[1];
            return word && (command || word === query);
          });
          if (page) return tool("navigate", { routeId: page.id });
          const bareSubject =
            subject &&
            [subject.slug, ...Object.values(subject.name)].some(
              (alias) => alias.toLowerCase().normalize("NFC") === query,
            );
          if (subject && (command || bareSubject))
            return tool("navigate", { routeId: "subject", params: { slug: subject.slug } });
          const ask = query.match(knowledge);
          if (ask?.[0]) {
            const remaining = query.replace(ask[0], "").trim();
            if (remaining)
              return tool("search_knowledge", { query: remaining, sourceId: "questions" });
          }
          return { text: text.help };
        },
      },
    ],
    afterTool: (input) => afterTool(repo, input),
  });
}

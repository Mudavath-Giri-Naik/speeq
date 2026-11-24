import { createMemoryStore, type MemoryStore } from "@speeq/store-memory";
import { FakeLLMProvider, type FakeScript } from "@speeq/testing";
import { z } from "zod";
import {
  createSpeeq,
  defineKnowledgeSource,
  defineRoute,
  defineTool,
  type SpeeqConfig,
} from "../src/index.js";

export const SECRET = "test-secret-test-secret-test-secret-1234";

export interface TestUser {
  id: string;
  roles: string[];
}

/** Records every bookmark the write tool performs. */
export const bookmarks: Array<{ userId: string | undefined; questionId: string }> = [];

/** Builds a speeq instance with demo-like routes, tools and knowledge. */
export function makeSpeeq(script: FakeScript, overrides: Partial<SpeeqConfig<TestUser>> = {}) {
  const llm = new FakeLLMProvider(script);
  const store: MemoryStore = createMemoryStore({ quiet: true });
  const speeq = createSpeeq<TestUser>({
    secret: SECRET,
    agent: { name: "Helper", instructions: "Help the user." },
    llm,
    store,
    logger: { error: () => undefined, warn: () => undefined },
    routes: [
      defineRoute({ id: "pricing", path: "/pricing", title: "Pricing" }),
      defineRoute({
        id: "subject",
        path: "/subjects/:slug",
        title: "Subject",
        params: z.object({ slug: z.string(), tab: z.string().optional() }),
      }),
    ],
    tools: [
      defineTool({
        name: "count_questions",
        description: "Count questions",
        input: z.object({ subject: z.string() }),
        handler: ({ subject }) => ({ subject, count: 12 }),
      }),
      defineTool({
        name: "bookmark_question",
        description: "Bookmark a question",
        input: z.object({ questionId: z.string() }),
        risk: "write",
        confirmationSummary: ({ questionId }) => `Bookmark question ${questionId}?`,
        handler: ({ questionId }, ctx) => {
          bookmarks.push({ userId: ctx.user?.id, questionId });
          return { bookmarked: questionId };
        },
      }),
    ],
    knowledge: [
      defineKnowledgeSource({
        id: "faq",
        description: "Frequently asked questions",
        search: async (q) => [{ id: "1", title: "Refunds", content: `Refund policy for ${q}` }],
      }),
    ],
    ...overrides,
  });
  return { speeq, llm, store };
}

/** Header that a `resolveUser` in tests reads to decide who is signed in. */
export function userResolver(request: Request): TestUser | null {
  const id = request.headers.get("x-test-user");
  return id ? { id, roles: id === "admin" ? ["admin"] : ["student"] } : null;
}

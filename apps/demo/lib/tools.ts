import { defineTool, SpeeqError, type ToolDefinition } from "@speeq/server";
import { z } from "zod";
import type { QuestionRepository } from "./data/repository";
import type { DemoUser } from "./demo-auth";
import { difficulty, subjectSlug } from "./routes";

function tool<Input extends z.ZodType>(definition: ToolDefinition<Input, DemoUser>) {
  return defineTool(definition);
}

function noQuestion() {
  return new SpeeqError("NOT_FOUND", { message: "No question with that number." });
}

/** Exposes catalogue queries and the user's confirmed bookmark actions. */
export function createDemoTools(repo: QuestionRepository, bookmarks: Map<string, Set<number>>) {
  return [
    tool({
      name: "list_subjects",
      description: "List the study subjects and their question counts.",
      input: z.object({}),
      handler: () => ({
        subjects: repo.listSubjects().map(({ slug, name }) => ({
          slug,
          name: name.en,
          questionCount: repo.countQuestions({ subject: slug }),
        })),
      }),
    }),
    tool({
      name: "count_questions",
      description: "Count practice questions, optionally by subject, topic or difficulty.",
      input: z.object({
        subject: subjectSlug.optional(),
        topic: z.string().optional(),
        difficulty: difficulty.optional(),
      }),
      handler: (filter) => ({ count: repo.countQuestions(filter), filter }),
    }),
    tool({
      name: "list_topics",
      description: "List the topics in a subject and their question counts.",
      input: z.object({ subject: subjectSlug }),
      handler: ({ subject }) => ({
        subject,
        topics: repo.listTopics(subject).map(({ name, count }) => ({ name, count })),
      }),
    }),
    tool({
      name: "get_question",
      description: "Look up a practice question by its number.",
      input: z.object({ id: z.number().int().min(1).max(9999) }),
      handler: ({ id }) => {
        const question = repo.getQuestion(id);
        if (!question) throw noQuestion();
        return question;
      },
    }),
    tool({
      name: "list_bookmarks",
      description: "List the current user's bookmarked question numbers.",
      input: z.object({}),
      handler: (_, { user }) => ({
        bookmarks: user ? [...(bookmarks.get(user.id) ?? [])] : [],
        signedIn: !!user,
      }),
    }),
    tool({
      name: "bookmark_question",
      description: "Save a practice question to the signed-in user's bookmarks.",
      risk: "write",
      input: z.object({ questionId: z.number().int() }),
      confirmationSummary: ({ questionId }) => {
        const prompt = repo.getQuestion(questionId)?.prompt;
        const preview = prompt && prompt.length > 60 ? `${prompt.slice(0, 59)}…` : prompt;
        return preview
          ? `Bookmark question ${questionId}: "${preview}"?`
          : `Bookmark question ${questionId}?`;
      },
      handler: ({ questionId }, { user }) => {
        if (!user) throw new SpeeqError("FORBIDDEN", { message: "Sign in to bookmark questions." });
        if (!repo.getQuestion(questionId)) throw noQuestion();
        const saved = bookmarks.get(user.id) ?? new Set<number>();
        saved.add(questionId);
        bookmarks.set(user.id, saved);
        return { bookmarked: true, questionId, total: saved.size };
      },
    }),
  ];
}

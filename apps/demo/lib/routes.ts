import { defineRoute } from "@speeq/server";
import { z } from "zod";
import { DIFFICULTIES, SUBJECT_SLUGS } from "./data/subjects";

/** Schemas shared by navigation and the practice filter. */
export const subjectSlug = z.enum(SUBJECT_SLUGS);

/** Supported question difficulty values. */
export const difficulty = z.enum(DIFFICULTIES);

/** The pages Vidya can open. */
export const routes = [
  defineRoute({
    id: "home",
    path: "/",
    title: "Home",
    description: "Start at the study dashboard.",
  }),
  defineRoute({
    id: "subjects",
    path: "/subjects",
    title: "Subjects",
    description: "Browse the six study subjects.",
  }),
  defineRoute({
    id: "subject",
    path: "/subjects/:slug",
    title: "Subject",
    description: "Read a subject's topics and questions.",
    params: z.object({ slug: subjectSlug }),
  }),
  defineRoute({
    id: "practice",
    path: "/practice",
    title: "Practice",
    description: "Browse and filter the question bank.",
    params: z.object({
      subject: subjectSlug.optional(),
      difficulty: difficulty.optional(),
      q: z.string().max(100).optional(),
    }),
  }),
  defineRoute({
    id: "question",
    path: "/questions/:id",
    title: "Question",
    description: "Open a numbered practice question.",
    params: z.object({ id: z.string().regex(/^\d{1,4}$/) }),
  }),
  defineRoute({
    id: "pricing",
    path: "/pricing",
    title: "Pricing",
    description: "Compare the example study plans.",
  }),
  defineRoute({
    id: "about",
    path: "/about",
    title: "About",
    description: "Learn what the demo includes.",
  }),
  defineRoute({
    id: "login",
    path: "/login",
    title: "Sign in",
    description: "Choose a demo account.",
  }),
];

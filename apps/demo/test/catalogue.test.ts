import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { repo } from "../lib/data/repository";
import { DIFFICULTIES } from "../lib/data/subjects";
import { routes, subjectSlug } from "../lib/routes";

it("contains six subjects with ten original questions each and stable catalogue references", () => {
  const subjects = repo.listSubjects();
  const questions = repo.listQuestions();
  expect(subjects).toHaveLength(6);
  expect(questions.map((question) => question.id)).toEqual(
    Array.from({ length: 60 }, (_, index) => index + 1),
  );
  for (const subject of subjects) {
    expect(subject.name.te).toMatch(/\p{Script=Telugu}/u);
    expect(subject.name.hi).toMatch(/\p{Script=Devanagari}/u);
    expect(subject.topics.length).toBeGreaterThanOrEqual(3);
    expect(subject.topics.length).toBeLessThanOrEqual(4);
    expect(repo.countQuestions({ subject: subject.slug })).toBe(10);
  }
  for (const question of questions) {
    expect(
      repo.getSubject(question.subject)?.topics.some((topic) => topic.name === question.topic),
    ).toBe(true);
    expect(DIFFICULTIES).toContain(question.difficulty);
    expect(new Set(question.options).size).toBe(4);
    expect(question.options[question.answerIndex]).toBeTruthy();
  }
});

it("filters questions, counts topics and ranks an exact topic before question matches", () => {
  expect(repo.countQuestions({ subject: "physics", topic: "motion", difficulty: "easy" })).toBe(2);
  expect(repo.countQuestions({ subject: "chemistry", difficulty: "hard" })).toBe(3);
  expect(repo.countQuestions({ q: "parallel", subject: "physics" })).toBe(2);
  expect(repo.listTopics("physics").map(({ name, count }) => [name, count])).toEqual([
    ["Motion", 4],
    ["Electric circuits", 3],
    ["Light", 3],
  ]);
  expect(repo.search("ELECTRIC CIRCUITS", 2)[0]).toMatchObject({
    id: "topic:physics:Electric circuits",
    href: "/subjects/physics",
  });
  expect(repo.search("circuit", 1)).toHaveLength(1);
  expect(repo.search("", 5)).toEqual([]);
  expect(repo.getQuestion(61)).toBeUndefined();
});

it("maps every manifest path to a real page and uses the same subject slugs", () => {
  expect(routes.map((route) => route.id)).toEqual([
    "home",
    "subjects",
    "subject",
    "practice",
    "question",
    "pricing",
    "about",
    "login",
  ]);
  for (const route of routes) {
    const path = route.path.replace(/:(\w+)/g, "[$1]").replace(/\/$/, "");
    expect(existsSync(new URL(`../app${path}/page.tsx`, import.meta.url)), route.id).toBe(true);
  }
  expect(subjectSlug.options).toEqual(repo.listSubjects().map((subject) => subject.slug));
  const subjectRoute = routes.find((route) => route.id === "subject");
  const practiceRoute = routes.find((route) => route.id === "practice");
  for (const slug of subjectSlug.options) {
    expect(subjectRoute?.params?.safeParse({ slug }).success).toBe(true);
    expect(practiceRoute?.params?.safeParse({ subject: slug }).success).toBe(true);
  }
  expect(subjectRoute?.params?.safeParse({ slug: "invalid" }).success).toBe(false);
});

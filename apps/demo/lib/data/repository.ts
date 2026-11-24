import { type Question, questions } from "./questions";
import { type Difficulty, type Subject, type SubjectSlug, subjects, type Topic } from "./subjects";

/** Filters for listing and counting practice questions. */
export interface QuestionFilter {
  subject?: SubjectSlug;
  topic?: string;
  difficulty?: Difficulty;
  q?: string;
}

/** A ranked result from the study catalogue. */
export interface StudyHit {
  id: string;
  title: string;
  content: string;
  href: string;
}

/** The demo's data-access boundary. */
export interface QuestionRepository {
  listSubjects(): readonly Subject[];
  getSubject(slug: string): Subject | undefined;
  listQuestions(filter?: QuestionFilter): Question[];
  countQuestions(filter?: QuestionFilter): number;
  getQuestion(id: number): Question | undefined;
  listTopics(subject: SubjectSlug): Array<Topic & { count: number }>;
  search(query: string, limit: number): StudyHit[];
}

function normalize(text: string) {
  return text.normalize("NFC").toLowerCase();
}

function tokens(text: string) {
  return normalize(text).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

const hits = [
  ...subjects.flatMap((subject) =>
    subject.topics.map((topic) => ({
      id: `topic:${subject.slug}:${topic.name}`,
      title: topic.name,
      content: topic.summary,
      href: `/subjects/${subject.slug}`,
      searchable: `${topic.name} ${topic.summary} ${Object.values(subject.name).join(" ")}`,
    })),
  ),
  ...questions.map((question) => ({
    id: `q:${question.id}`,
    title: `Question ${question.id}`,
    content: `${question.prompt} ${question.explanation}`,
    href: `/questions/${question.id}`,
    searchable: `${question.prompt} ${question.topic} ${question.explanation}`,
  })),
];

function listQuestions({ subject, topic, difficulty, q }: QuestionFilter = {}) {
  const query = normalize(q?.trim() ?? "");
  return questions.filter(
    (question) =>
      (!subject || question.subject === subject) &&
      (!topic || normalize(question.topic) === normalize(topic.trim())) &&
      (!difficulty || question.difficulty === difficulty) &&
      (!query ||
        normalize(`${question.prompt} ${question.topic} ${question.explanation}`).includes(query)),
  );
}

/** In-memory repository backed by the demo's original study content. */
export const repo: QuestionRepository = {
  listSubjects: () => subjects,
  getSubject: (slug) => subjects.find((subject) => subject.slug === slug),
  listQuestions,
  countQuestions: (filter) => listQuestions(filter).length,
  getQuestion: (id) => questions.find((question) => question.id === id),
  listTopics(subject) {
    return (
      this.getSubject(subject)?.topics.map((topic) => ({
        ...topic,
        count: this.countQuestions({ subject, topic: topic.name }),
      })) ?? []
    );
  },
  search(query, limit) {
    const terms = [...new Set(tokens(query))];
    if (!terms.length || limit <= 0) return [];
    const phrase = terms.join(" ");
    return hits
      .map(({ searchable, ...hit }) => {
        const words = new Set(tokens(searchable));
        const title = tokens(hit.title).join(" ");
        const matches = terms.filter((term) => words.has(term)).length;
        return { hit, score: matches + (matches && title === phrase ? terms.length * 2 : 0) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ hit }) => hit);
  },
};

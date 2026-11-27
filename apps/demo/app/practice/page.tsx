import Link from "next/link";
import { PracticeFilters } from "@/components/practice-filters";
import { repo } from "@/lib/data/repository";
import { DIFFICULTIES } from "@/lib/data/subjects";
import { difficulty, subjectSlug } from "@/lib/routes";

type Search = Record<string, string | string[] | undefined>;

/** Lists questions using the three filters in the query string. */
export default async function Practice({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const subject = subjectSlug.safeParse(params.subject).data;
  const level = difficulty.safeParse(params.difficulty).data;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const questions = repo.listQuestions({ subject, difficulty: level, q });
  return (
    <>
      <h1>Practice</h1>
      <PracticeFilters
        subjects={repo.listSubjects().map((item) => ({ slug: item.slug, name: item.name.en }))}
        difficulties={DIFFICULTIES}
        subject={subject ?? ""}
        difficulty={level ?? ""}
        q={q}
      />
      <p className="muted">
        {questions.length} {questions.length === 1 ? "question" : "questions"}
      </p>
      {questions.length ? (
        <ul className="question-list">
          {questions.map((question) => (
            <li key={question.id}>
              <Link href={`/questions/${question.id}`}>{question.prompt}</Link>
              <small>
                {repo.getSubject(question.subject)?.name.en} · {question.topic} ·{" "}
                {question.difficulty}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p>No questions match these filters.</p>
      )}
    </>
  );
}

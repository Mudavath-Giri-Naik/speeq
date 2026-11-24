import Link from "next/link";
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
      <form method="get" action="/practice" className="card filters">
        <label>
          Subject
          <select name="subject" defaultValue={subject ?? ""}>
            <option value="">All subjects</option>
            {repo.listSubjects().map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.name.en}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select name="difficulty" defaultValue={level ?? ""}>
            <option value="">All levels</option>
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder="e.g. motion"
          />
        </label>
        <button type="submit">Apply filters</button>
      </form>
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

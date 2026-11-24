import Link from "next/link";
import { notFound } from "next/navigation";
import { repo } from "@/lib/data/repository";

/** Renders one question, with the worked answer behind a disclosure. */
export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const question = /^\d{1,4}$/.test(id) ? repo.getQuestion(Number(id)) : undefined;
  if (!question) notFound();
  return (
    <>
      <Link href={`/practice?subject=${question.subject}`}>Back to practice</Link>
      <p className="muted">
        {repo.getSubject(question.subject)?.name.en} · {question.topic} · {question.difficulty}
      </p>
      <h1>Question {question.id}</h1>
      <article className="card question">
        <h2>{question.prompt}</h2>
        <ol type="A" className="options">
          {question.options.map((option) => (
            <li key={option}>{option}</li>
          ))}
        </ol>
        <details>
          <summary>Show answer</summary>
          <p>
            <strong>{question.options[question.answerIndex]}</strong>
          </p>
          <p>{question.explanation}</p>
        </details>
      </article>
    </>
  );
}

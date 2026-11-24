import Link from "next/link";
import { notFound } from "next/navigation";
import { repo } from "@/lib/data/repository";

/** Shows the study topics and practice questions for a subject. */
export default async function SubjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const subject = repo.getSubject((await params).slug);
  if (!subject) notFound();
  return (
    <>
      <Link href="/subjects">All subjects</Link>
      <h1>{subject.name.en}</h1>
      <p>
        <span lang="te">{subject.name.te}</span> · <span lang="hi">{subject.name.hi}</span>
      </p>
      <Link className="button" href={`/practice?subject=${subject.slug}`}>
        Practise {subject.name.en}
      </Link>
      <h2>Topics</h2>
      <div className="grid">
        {repo.listTopics(subject.slug).map((topic) => (
          <section className="card" key={topic.name}>
            <h3>{topic.name}</h3>
            <p>{topic.summary}</p>
            <small>{topic.count} questions</small>
          </section>
        ))}
      </div>
      <h2>Questions</h2>
      <ul className="question-list">
        {repo.listQuestions({ subject: subject.slug }).map((question) => (
          <li key={question.id}>
            <Link href={`/questions/${question.id}`}>{question.prompt}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}

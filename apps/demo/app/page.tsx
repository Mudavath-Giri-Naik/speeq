import Link from "next/link";
import { repo } from "@/lib/data/repository";

/** Introduces the study catalogue and its main entry points. */
export default function Home() {
  return (
    <>
      <section className="hero">
        <h1>Practise one question at a time.</h1>
        <p>
          Study across six subjects with {repo.countQuestions()} original questions and worked
          explanations.
        </p>
        <Link className="button" href="/practice">
          Start practising
        </Link>
      </section>
      <section>
        <h2>Choose a subject</h2>
        <div className="grid">
          {repo.listSubjects().map((subject) => (
            <Link
              className="card subject-card"
              href={`/subjects/${subject.slug}`}
              key={subject.slug}
            >
              <strong>{subject.name.en}</strong>
              <span>{repo.countQuestions({ subject: subject.slug })} questions</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

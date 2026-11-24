import Link from "next/link";
import { repo } from "@/lib/data/repository";

/** Lists the subjects in the practice catalogue. */
export default function Subjects() {
  return (
    <>
      <h1>Subjects</h1>
      <div className="grid">
        {repo.listSubjects().map((subject) => (
          <Link className="card subject-card" key={subject.slug} href={`/subjects/${subject.slug}`}>
            <strong>{subject.name.en}</strong>
            <span>
              <span lang="te">{subject.name.te}</span> · <span lang="hi">{subject.name.hi}</span>
            </span>
            <span>
              {subject.topics.length} topics · {repo.countQuestions({ subject: subject.slug })}{" "}
              questions
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

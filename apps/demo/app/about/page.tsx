import Link from "next/link";

/** Explains the purpose and data of the demo. */
export default function About() {
  return (
    <>
      <h1>About Vidya Study</h1>
      <p>
        Vidya Study is an exam-prep demo with original questions and summaries across six subjects.
      </p>
      <p>
        Browse the catalogue as a guest or sign in with a demo account. Vidya, the study assistant,
        can open pages and look up topics through the speeq API.
      </p>
      <Link className="button" href="/subjects">
        Browse subjects
      </Link>
    </>
  );
}

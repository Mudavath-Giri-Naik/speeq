import type { Metadata } from "next";
import { formatCount, getSiteStats } from "../../../lib/stats";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Packages",
  description: "All ten speeq packages, what each one does, and how to install it.",
  alternates: { canonical: "/docs/packages" },
};

export default async function PackagesPage() {
  const stats = await getSiteStats();
  return (
    <article className="max-w-[56rem]">
      <p className="eyebrow mb-3">More</p>
      <div className="prose-docs">
        <h1>Packages</h1>
        <p>
          speeq is split into small packages. Install the single <code>speeq</code> package for
          everything, or pick only the parts you need. The version and download numbers below are
          live.
        </p>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {stats.packages.map((p) => (
          <a
            key={p.name}
            href={`https://www.npmjs.com/package/${p.name}`}
            target="_blank"
            rel="noreferrer"
            className="card glow-card group block p-5 transition hover:border-line-strong"
          >
            <div className="flex items-start justify-between gap-3">
              <code className="font-mono text-[0.9rem] font-semibold text-fg">{p.name}</code>
              <span className="rounded-full border border-line px-2 py-0.5 font-mono text-xs text-muted">
                {p.version ?? "–"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p.purpose}</p>
            <div className="mt-4 flex items-center justify-between text-xs text-muted">
              <span>{formatCount(p.week)} installs last week</span>
              <span className="text-accent opacity-0 transition group-hover:opacity-100">
                npm →
              </span>
            </div>
          </a>
        ))}
      </div>
      <div className="prose-docs mt-10">
        <h2>Which one do I install?</h2>
        <ul>
          <li>
            <strong>Most people:</strong> <code>npm i speeq@next zod</code>.
          </li>
          <li>
            <strong>Only what you need:</strong> install the scoped packages, such as{" "}
            <code>@speeq/server</code> and <code>@speeq/react</code>.
          </li>
        </ul>
        <p>
          See <a href="/docs/install">Install</a> for the full list of import paths.
        </p>
      </div>
    </article>
  );
}

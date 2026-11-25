import type { Metadata } from "next";
import { REPO_URL } from "../../../lib/site";
import { getSiteStats } from "../../../lib/stats";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Releases",
  description: "Every published version of speeq, newest first.",
  alternates: { canonical: "/docs/releases" },
};

function date(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(iso),
  );
}

export default async function ReleasesPage() {
  const stats = await getSiteStats();
  const real = stats.releases.filter((r) => !r.version.startsWith("0.0.0"));
  return (
    <article className="max-w-[46rem]">
      <p className="eyebrow mb-3">More</p>
      <div className="prose-docs">
        <h1>Releases</h1>
        <p>
          Every version of the <code>speeq</code> package that is on npm, newest first. All ten
          packages share one version number. speeq is pre-1.0, so read the changelog before you
          upgrade.
        </p>
      </div>
      {real.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
          The release list could not be loaded just now. It will appear on the next refresh. You can
          also read it on{" "}
          <a
            className="text-accent hover:underline"
            href="https://www.npmjs.com/package/speeq?activeTab=versions"
          >
            npm
          </a>
          .
        </p>
      ) : (
        <ol className="mt-8 space-y-3">
          {real.map((r, i) => (
            <li key={r.version} className="card flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
              <span className="font-mono text-base font-semibold text-fg">{r.version}</span>
              {i === 0 && (
                <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                  Latest
                </span>
              )}
              <span className="text-sm text-muted">{date(r.date)}</span>
              <a
                href={`${REPO_URL}/blob/main/packages/speeq/CHANGELOG.md`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-sm text-accent hover:underline"
              >
                Changelog
              </a>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

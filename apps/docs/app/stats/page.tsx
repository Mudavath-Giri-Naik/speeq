import type { Metadata } from "next";
import Link from "next/link";
import { AreaChart } from "../../components/area-chart";
import { NPM_URL, REPO_URL } from "../../lib/site";
import { formatCount, getSiteStats } from "../../lib/stats";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Adoption",
  description: "Live numbers for speeq: npm installs, versions and GitHub activity.",
  alternates: { canonical: "/stats" },
};

function date(iso: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(iso),
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-fg tabular-nums sm:text-4xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function StatsPage() {
  const stats = await getSiteStats();
  const speeq = stats.packages.find((p) => p.name === "speeq");
  return (
    <main className="container-x py-12 sm:py-16">
      <p className="eyebrow">Adoption</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-fg sm:text-5xl">
        speeq in numbers
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Live numbers from npm and GitHub. They refresh about once an hour.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card label="Installs, last week" value={formatCount(speeq?.week)} hint="speeq package" />
        <Card label="Installs, last month" value={formatCount(speeq?.month)} hint="speeq package" />
        <Card
          label="Installs, all time"
          value={formatCount(stats.speeqAllTime)}
          hint="since 25 Nov 2026"
        />
        <Card
          label="All packages, last week"
          value={formatCount(stats.totalWeek)}
          hint="all ten packages"
        />
        <Card label="GitHub stars" value={formatCount(stats.github?.stars)} />
        <Card label="GitHub forks" value={formatCount(stats.github?.forks)} />
        <Card label="Open issues" value={formatCount(stats.github?.openIssues)} />
        <Card
          label="Latest version"
          value={speeq?.version ?? "–"}
          hint={`published ${date(speeq?.lastPublished ?? null)}`}
        />
      </div>

      <section className="card mt-8 p-5 sm:p-7" aria-labelledby="daily">
        <h2 id="daily" className="text-xl font-semibold text-fg">
          Installs per day
        </h2>
        <p className="mb-5 text-sm text-muted">The last 30 days of the speeq package.</p>
        <AreaChart points={stats.speeqDaily30} title="Daily installs of speeq" />
      </section>

      <section className="mt-8" aria-labelledby="packages">
        <h2 id="packages" className="text-xl font-semibold text-fg">
          Every package
        </h2>
        <div className="scroll-thin card mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 text-right font-medium">Last week</th>
                <th className="px-4 py-3 text-right font-medium">Last month</th>
              </tr>
            </thead>
            <tbody>
              {stats.packages.map((p) => (
                <tr key={p.name} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <a
                      href={`https://www.npmjs.com/package/${p.name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[0.85rem] text-fg hover:text-accent"
                    >
                      {p.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-soft">{p.version ?? "–"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCount(p.week)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCount(p.month)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2" aria-labelledby="releases">
        <div className="card p-5 sm:p-7">
          <h2 id="releases" className="text-xl font-semibold text-fg">
            Recent releases
          </h2>
          {stats.releases.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Release history is not available right now.</p>
          ) : (
            <ol className="mt-4 space-y-3 border-l border-line pl-5">
              {stats.releases.slice(0, 6).map((r) => (
                <li key={r.version} className="relative">
                  <span
                    className="absolute top-1.5 -left-[1.6rem] h-2 w-2 rounded-full bg-accent"
                    aria-hidden="true"
                  />
                  <span className="font-mono text-sm text-fg">{r.version}</span>
                  <span className="ml-3 text-sm text-muted">{date(r.date)}</span>
                </li>
              ))}
            </ol>
          )}
          <Link
            href="/docs/releases"
            className="mt-5 inline-block text-sm text-accent hover:underline"
          >
            See all releases
          </Link>
        </div>
        <div className="card p-5 sm:p-7">
          <h2 className="text-xl font-semibold text-fg">Read the numbers carefully</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>npm updates its download counts about once a day.</li>
            <li>
              Counts include automated installs, like CI jobs and mirrors. They are not unique
              people.
            </li>
            <li>
              A dash means the number could not be loaded just now. It fills in on the next refresh.
            </li>
            <li>
              speeq itself does not track you. Read{" "}
              <Link href="/docs/concepts/privacy" className="text-accent hover:underline">
                Privacy and telemetry
              </Link>
              .
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <a
              href={NPM_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              View on npm
            </a>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

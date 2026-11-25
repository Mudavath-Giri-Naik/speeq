import type { ReactNode } from "react";
import { Card, Empty } from "../../components/ui/card";
import { percentileFromHistogram } from "../../lib/metrics/histogram";
import { parseRange, RANGES, type Range, rangeWindow } from "../../lib/metrics/range";
/** Route query parameters supplied by Next. */
export type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };
/** Produces validated range and UTC boundaries. */
export async function selection(props: PageProps) {
  const params = await props.searchParams;
  const range = parseRange(params.range);
  return { params, range, window: rangeWindow(range, new Date()) };
}
const routes = {
  Overview: "/dashboard",
  Installs: "/dashboard/installs",
  Projects: "/dashboard/projects",
  Features: "/dashboard/features",
  Reliability: "/dashboard/reliability",
};
/** Navigation shared by each server-rendered page, with its actual active range and route. */
export function View({
  page,
  range,
  children,
}: {
  page: keyof typeof routes;
  range: Range;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <nav aria-label="Dashboard" className="tabs">
        {Object.entries(routes).map(([name, path]) => (
          <a
            key={name}
            aria-current={name === page ? "page" : undefined}
            href={`${path}?range=${range}`}
          >
            {name}
          </a>
        ))}
      </nav>
      <main>
        <div className="title">
          <h1>{page}</h1>
          <nav className="ranges" aria-label="Reporting period">
            {RANGES.map((r) => (
              <a
                key={r}
                aria-current={r === range ? "true" : undefined}
                href={`${routes[page]}?range=${r}`}
              >
                {r}
              </a>
            ))}
          </nav>
        </div>
        {children}
      </main>
    </div>
  );
}
/** Formats a measured rate without dividing empty populations. */
export function formatRate(n: number | null, suffix = "") {
  return n === null ? "n/a" : `${Number(n.toFixed(1))}${suffix}`;
}
/** Formats a histogram percentile including overflow. */
export function latency(hist: number[], p: number) {
  const n = percentileFromHistogram(hist, p);
  return n === null ? "n/a" : typeof n === "number" ? `${n} ms` : "> 16 s";
}
/** Groups summary measures in a definition list. */
export function Stats({
  title,
  data,
  empty = false,
}: {
  title: string;
  data: [string, number | string][];
  empty?: boolean;
}) {
  return (
    <Card title={title}>
      <dl className="stats">
        {data.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{typeof value === "number" ? value.toLocaleString("en-US") : value}</dd>
          </div>
        ))}
      </dl>
      {empty && <Empty />}
    </Card>
  );
}

import { BarChart } from "../../../components/charts/bar-chart";
import { Distribution } from "../../../components/charts/distribution";
import { Card, Empty } from "../../../components/ui/card";
import { getDb } from "../../../db/client";
import { requireAdmin } from "../../../lib/auth/session";
import { reliability } from "../../../lib/metrics/reliability";
import { formatRate, latency, type PageProps, Stats, selection, View } from "../view";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const labels = ["≤250 ms", "≤500 ms", "≤1 s", "≤2 s", "≤4 s", "≤8 s", "≤16 s", ">16 s"];
/** Reports errors and both response latency distributions. */
export default async function Reliability(props: PageProps) {
  const s = await requireAdmin(),
    { window, range } = await selection(props);
  const r = await reliability(await getDb(), s, window);
  return (
    <View page="Reliability" range={range}>
      <Stats
        title="Failure rate"
        data={[["Errors per 100 turns", formatRate(r.rate)]]}
        empty={r.rate === null && !r.errors.length}
      />
      <div className="grid">
        <Card title="Errors by code">
          <Distribution data={r.errors} />
        </Card>
        <Card title="Daily errors">
          <BarChart label="Daily errors" data={r.daily} />
        </Card>
        {(
          [
            ["Total latency", r.total],
            ["First-token latency", r.first],
          ] as const
        ).map(([title, counts]) => (
          <Card key={title} title={title}>
            <p>
              p50 {latency(counts, 0.5)} · p95 {latency(counts, 0.95)}
            </p>
            {counts.some(Boolean) ? (
              <Distribution data={counts.map((value, i) => ({ label: labels[i] ?? "", value }))} />
            ) : (
              <Empty />
            )}
          </Card>
        ))}
      </div>
    </View>
  );
}

import { Distribution } from "../../../components/charts/distribution";
import { Card, Empty } from "../../../components/ui/card";
import { getDb } from "../../../db/client";
import { requireAdmin } from "../../../lib/auth/session";
import { features } from "../../../lib/metrics/features";
import { formatRate, type PageProps, selection, View } from "../view";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Shows configuration adoption and observed usage. */
export default async function Features(props: PageProps) {
  const s = await requireAdmin(),
    { range, window } = await selection(props);
  const f = await features(await getDb(), s, window);
  return (
    <View page="Features" range={range}>
      <div className="grid">
        <Card title="Feature adoption">
          <p>{f.reported} instances reported features</p>
          <Distribution data={f.flags} suffix="%" />
          <p>Average languages per instance: {formatRate(f.avgLanguages)}</p>
        </Card>
        {(
          [
            ["Store adapters", f.store],
            ["Language model adapters", f.llm],
            ["Turn input", f.modes],
            ["Tool calls", f.tools],
          ] as const
        ).map(([title, data]) => (
          <Card key={title} title={title}>
            {data.some((x) => x.value) ? <Distribution data={data} /> : <Empty />}
          </Card>
        ))}
      </div>
    </View>
  );
}

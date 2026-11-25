import { BarChart } from "../../components/charts/bar-chart";
import { Distribution } from "../../components/charts/distribution";
import { LineChart } from "../../components/charts/line-chart";
import { Card } from "../../components/ui/card";
import { getDb } from "../../db/client";
import { requireAdmin } from "../../lib/auth/session";
import { getGithubStats, getNpmDownloads } from "../../lib/external-stats";
import { overview } from "../../lib/metrics/overview";
import { formatRate, latency, type PageProps, Stats, selection, View } from "./view";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Aggregate adoption and activity for the selected reporting period. */
export default async function Overview(props: PageProps) {
  const s = await requireAdmin(),
    db = await getDb(),
    { range, window } = await selection(props);
  const [o, npm, github] = await Promise.all([
    overview(db, s, window),
    getNpmDownloads(db, s),
    getGithubStats(db, s),
  ]);
  const t = o.totals;
  return (
    <View page="Overview" range={range}>
      <Stats
        title="Activity"
        empty={!t.active}
        data={[
          ["Active installs", t.active],
          ["Sessions", t.sessions],
          ["Turns", t.turns],
          ["Voice share", formatRate(o.voiceShare, "%")],
          ["Navigations", t.nav],
          ["Built-in tool calls", t.builtin],
          ["Custom tool calls", t.custom],
          ["Knowledge searches", t.searches],
          ["Approval rate", formatRate(o.approvalRate, "%")],
          ["Errors per 100 turns", formatRate(o.errorRate)],
        ]}
      />
      <div className="grid">
        <Card title="Turns per day">
          <LineChart
            label="Daily turns"
            data={o.daily.map((x) => ({ label: x.day, value: x.turns }))}
          />
        </Card>
        <Card title="Sessions per day">
          <LineChart
            label="Daily sessions"
            data={o.daily.map((x) => ({ label: x.day, value: x.sessions }))}
          />
        </Card>
        <Card title="New installs">
          <BarChart
            label="New installs per day"
            data={o.daily.map((x) => ({ label: x.day, value: x.installs }))}
          />
        </Card>
        <Card title="Top languages">
          <Distribution data={o.languages} />
        </Card>
        <Stats
          title="Total latency"
          empty={!o.histogram.some(Boolean)}
          data={[
            ["p50", latency(o.histogram, 0.5)],
            ["p95", latency(o.histogram, 0.95)],
          ]}
        />
        <Stats
          title="Weekly npm downloads"
          data={npm.map(({ name, stat }) => [
            name,
            stat.status !== "ok"
              ? "Unavailable"
              : (stat.value.published ? String(stat.value.downloads) : "Unpublished") +
                (stat.stale ? " (stale)" : ""),
          ])}
        />
        <Card title="GitHub">
          {github.status === "ok" ? (
            <p>
              {github.value.stars} stars · {github.value.forks} forks
              {github.stale ? " (stale)" : ""}
            </p>
          ) : (
            <p>{github.status === "not-configured" ? "Not configured" : "Unavailable"}</p>
          )}
        </Card>
      </div>
    </View>
  );
}

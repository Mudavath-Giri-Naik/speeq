import { Distribution } from "../../../components/charts/distribution";
import { Card, Empty } from "../../../components/ui/card";
import { Table } from "../../../components/ui/table";
import { getDb } from "../../../db/client";
import { requireAdmin } from "../../../lib/auth/session";
import { installs, parsePage } from "../../../lib/metrics/installs";
import { type PageProps, Stats, selection, View } from "../view";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Lists anonymous installs and deployment attributes. */
export default async function Installs(props: PageProps) {
  const s = await requireAdmin(),
    { params, range, window } = await selection(props);
  const m = await installs(await getDb(), s, { window, page: parsePage(params.page) });
  return (
    <View page="Installs" range={range}>
      <Stats
        title="Recent activity"
        data={[["Active in last 7 days", m.active]]}
        empty={!m.rows.length}
      />
      <Card title="Instances">
        {m.rows.length ? (
          <>
            <Table
              headers={[
                "Instance",
                "Project",
                "SDK",
                "Runtime",
                "Framework",
                "First seen (UTC)",
                "Last seen (UTC)",
              ]}
            >
              {m.rows.map((r) => (
                <tr key={r.rowKey}>
                  {[
                    r.id,
                    r.project,
                    r.sdk,
                    r.runtime || "Unknown",
                    r.framework,
                    r.first,
                    r.last,
                  ].map((v, i) => (
                    <td key={i.toString()}>{v}</td>
                  ))}
                </tr>
              ))}
            </Table>
            <div className="pagination">
              {m.page > 1 && <a href={`?range=${range}&page=${m.page - 1}`}>Previous</a>} Page{" "}
              {m.page} of {m.pages}{" "}
              {m.page < m.pages && <a href={`?range=${range}&page=${m.page + 1}`}>Next</a>}
            </div>
          </>
        ) : (
          <Empty />
        )}
      </Card>
      <div className="grid">
        {(
          [
            ["SDK versions", m.sdk],
            ["Runtimes", m.runtime],
            ["Frameworks", m.framework],
          ] as const
        ).map(([title, data]) => (
          <Card key={title} title={title}>
            <Distribution data={data} />
          </Card>
        ))}
      </div>
    </View>
  );
}

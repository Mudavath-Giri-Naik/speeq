import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, Empty } from "../../../components/ui/card";
import { Table } from "../../../components/ui/table";
import { getDb } from "../../../db/client";
import { requireAdmin } from "../../../lib/auth/session";
import { projectMetrics } from "../../../lib/metrics/projects";
import { type PageProps, selection, View } from "../view";
import { create, revoke } from "./actions";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Manages public project attribution keys. */
export default async function Projects(props: PageProps) {
  const s = await requireAdmin(),
    { params, window, range } = await selection(props);
  const rows = await projectMetrics(await getDb(), s, window);
  return (
    <View page="Projects" range={range}>
      <Card title="Create project">
        <form className="inline" action={create.bind(null, s)}>
          <label>
            Project name
            <input name="name" minLength={1} maxLength={80} required />
          </label>
          <Button>Create project</Button>
        </form>
        {params.error && <p role="alert">Unable to update project.</p>}
      </Card>
      <Card title="Project keys">
        {rows.length ? (
          <Table
            headers={[
              "Project",
              "Public key",
              "Created",
              "Status",
              "Installs",
              "Turns",
              "Last activity (UTC)",
              "Action",
            ]}
          >
            {rows.map((r) => (
              <tr key={r.id} className={r.revoked ? "revoked" : undefined}>
                <td>{r.name}</td>
                <td>
                  <code>{r.key}</code>
                </td>
                <td>{r.created}</td>
                <td>
                  <Badge revoked={r.revoked} />
                </td>
                <td>{r.instances}</td>
                <td>{r.turns}</td>
                <td>{r.activity ?? "n/a"}</td>
                <td>
                  {!r.revoked && (
                    <form action={revoke.bind(null, s)}>
                      <Button name="id" value={r.id} className="subtle">
                        Revoke
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty />
        )}
      </Card>
    </View>
  );
}

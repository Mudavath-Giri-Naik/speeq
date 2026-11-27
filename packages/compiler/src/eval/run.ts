import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DiscoveryResult } from "../adapter.js";
import { scan } from "../scan.js";
import { type GroundTruth, loadGroundTruth } from "./ground-truth.js";
import { score } from "./score.js";

/** Convert a scan outcome into the shape the scorer compares. */
export async function discoverWithScan(
  root: string,
  appDir?: string,
): Promise<DiscoveryResult & { status: string }> {
  const r = await scan({ root, ...(appDir ? { appDir } : {}) });
  if (r.status === "ok")
    return {
      status: r.status,
      capabilities: r.manifest.capabilities,
      diagnostics: r.manifest.diagnostics,
    };
  if (r.status === "unsupported")
    return { status: r.status, capabilities: [], diagnostics: r.diagnostics };
  return { status: r.status, capabilities: [], diagnostics: [] };
}
/** Score one fixture directory. Fixtures with a `selection` map are scored once per selectable app. */
export async function evaluateFixture(dir: string) {
  const truth = await loadGroundTruth(dir);
  const raw = JSON.parse(await readFile(join(dir, "expected.json"), "utf8")) as {
    selection?: Record<string, GroundTruth["capabilities"]>;
  };
  if (!raw.selection) return [score(truth, await discoverWithScan(dir))];
  const out = [];
  for (const [appDir, capabilities] of Object.entries(raw.selection))
    out.push(
      score(
        { ...truth, fixture: `${truth.fixture}@${appDir}`, capabilities },
        await discoverWithScan(dir, appDir),
      ),
    );
  return out;
}

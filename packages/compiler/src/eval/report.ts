import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscoveryResult } from "../adapter.js";
import { openRepoFs, type RepoFs } from "../fs/repo-fs.js";
import { loadGroundTruth } from "./ground-truth.js";
import { score } from "./score.js";
/** Render per-kind metrics and concrete mismatches as a terminal table. */
export function renderReport(scores: ReturnType<typeof score>[]) {
  const rows = ["fixture             kind        precision  recall"];
  for (const s of scores) {
    for (const k of s.perKind) {
      rows.push(
        [
          s.fixture.padEnd(19),
          k.kind.padEnd(11),
          `${100 * k.precision}%`.padEnd(10),
          `${100 * k.recall}%`,
        ].join(" "),
      );
      for (const id of k.falsePositives) rows.push(`  unexpected ${id}`);
      for (const id of k.falseNegatives) rows.push(`  missing ${id}`);
    }
    for (const key of [
      "forbidden",
      "missingUnsupported",
      "evidenceMismatch",
      "executableMismatch",
      "classificationMismatch",
    ] as const) {
      for (const item of s[key]) rows.push(`  ${key} ${JSON.stringify(item)}`);
    }
  }
  return rows.join("\n");
}
/** Empty baseline until framework discovery lands. */
export async function discover(_fs: RepoFs): Promise<DiscoveryResult> {
  return { capabilities: [], diagnostics: [] };
}
async function run() {
  const root = fileURLToPath(new URL("../../../../fixtures/compiler/", import.meta.url)),
    scores = [];
  for (const name of (await readdir(root)).sort()) {
    const dir = join(root, name);
    scores.push(score(await loadGroundTruth(dir), await discover(await openRepoFs({ root: dir }))));
  }
  console.log(renderReport(scores));
  if (scores.some((s) => s.supported && !s.passed)) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void run();

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscoveryResult } from "../adapter.js";
import { openRepoFs, type RepoFs } from "../fs/repo-fs.js";
import { evaluateFixture } from "./run.js";
import type { score } from "./score.js";
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
/** Empty baseline used to prove the scorer detects missing discovery. */
export async function emptyDiscover(_fs: RepoFs): Promise<DiscoveryResult> {
  return { capabilities: [], diagnostics: [] };
}
async function run() {
  const root = fileURLToPath(new URL("../../../../fixtures/compiler/", import.meta.url)),
    scores: ReturnType<typeof score>[] = [];
  const listing = await (await openRepoFs({ root })).listFiles();
  const names = listing
    .filter((f) => f.endsWith("/expected.json") && f.split("/").length === 2)
    .map((f) => f.split("/")[0] as string);
  for (const name of names) scores.push(...(await evaluateFixture(join(root, name))));
  console.log(renderReport(scores));
  if (scores.some((s) => s.supported && !s.passed)) process.exitCode = 1;
}
if (
  import.meta.url &&
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  void run();

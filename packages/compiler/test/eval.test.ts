import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RouteCapability } from "@speeq/core/manifest";
import { expect, it } from "vitest";
import {
  discover,
  type GroundTruth,
  loadGroundTruth,
  openRepoFs,
  renderReport,
  score,
} from "../src/index.js";

const fixtures = fileURLToPath(new URL("../../../fixtures/compiler/", import.meta.url));
const file = "app/page.tsx",
  evidence = { file, line: 1, detector: "next-app-page", note: "Page" };
const route: RouteCapability = {
  id: "route:/",
  kind: "route",
  title: "Home",
  framework: "nextjs-app",
  source: { file, line: 1 },
  evidence: [evidence],
  support: "proven",
  access: "read",
  sensitivity: "none",
  auth: { observed: "unknown", evidence: [] },
  related: [],
  fingerprint: "a".repeat(64),
  path: "/",
  pathPattern: "/",
  dynamic: "static",
  pathParams: [],
  queryParams: [],
};
const truth: GroundTruth = {
  fixture: "example",
  supported: true,
  capabilities: [
    {
      id: route.id,
      kind: "route",
      support: "proven",
      access: "read",
      evidence: [{ file, line: 1 }],
      executableWhenApproved: true,
    },
  ],
  unsupported: [{ code: "SQ0004", file }],
  forbidden: ["route:/trap"],
};
const diagnostic = { code: "SQ0004", severity: "warning", file, message: "Too large" } as const;
it("scores a perfect result and identifies identity, evidence, policy and diagnostic errors", () => {
  const perfect = score(truth, { capabilities: [route], diagnostics: [diagnostic] });
  expect(perfect.passed).toBe(true);
  expect(perfect.perKind.every((k) => k.precision === 1 && k.recall === 1)).toBe(true);
  const missing = score(truth, { capabilities: [], diagnostics: [] });
  expect(missing.perKind[0]).toMatchObject({ recall: 0, falseNegatives: [route.id] });
  expect(missing.unsupportedReported).toBe(false);
  const extra = score(truth, {
    capabilities: [
      { ...route, sensitivity: "credentials", evidence: [{ ...evidence, line: 2 }] },
      { ...route, id: "route:/trap" },
    ],
    diagnostics: [],
  });
  expect(extra).toMatchObject({
    passed: false,
    forbidden: ["route:/trap"],
    evidenceMismatch: [route.id],
    executableMismatch: [route.id],
    missingUnsupported: truth.unsupported,
  });
  expect(extra.perKind[0]).toMatchObject({ precision: 0.5, falsePositives: ["route:/trap"] });
  expect(
    score(truth, {
      capabilities: [{ ...route, evidence: [{ ...evidence, file: "wrong.tsx" }] }],
      diagnostics: [diagnostic],
    }).evidenceMismatch,
  ).toEqual([route.id]);
});
it("checks all fixture labels against source and the supported zero-recall baseline", async () => {
  const supported = [];
  for (const name of await readdir(fixtures)) {
    const dir = join(fixtures, name);
    const truth = await loadGroundTruth(dir);
    expect(truth.fixture).toBe(name);
    for (const c of truth.capabilities)
      for (const e of c.evidence) {
        const text = await readFile(join(dir, e.file), "utf8");
        expect(text.split("\n")[e.line - 1]?.trim()).toBeTruthy();
      }
    for (const d of truth.unsupported) expect((await stat(join(dir, d.file))).isFile()).toBe(true);
    if (["next-app-minimal", "next-pages-minimal"].includes(name)) {
      const scores = score(truth, await discover(await openRepoFs({ root: dir })));
      expect(scores.passed).toBe(false);
      expect(scores.perKind.find((k) => k.kind === "route")?.recall).toBe(0);
      expect(renderReport([scores])).toContain("missing route:");
      supported.push(name);
    }
  }
  expect(supported.sort()).toEqual(["next-app-minimal", "next-pages-minimal"]);
});

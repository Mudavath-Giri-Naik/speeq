import * as main from "@speeq/core";
import {
  type Manifest,
  parseDecisions,
  parseManifest,
  type RouteCapability,
} from "@speeq/core/manifest";
import { describe, expect, it } from "vitest";

const route: RouteCapability = {
  kind: "route",
  id: "route:/",
  path: "/",
  pathPattern: "/",
  dynamic: "static",
  pathParams: [],
  queryParams: [],
  title: "Home",
  framework: "nextjs-app",
  source: { file: "app/page.tsx", line: 1 },
  evidence: [{ file: "app/page.tsx", line: 1, detector: "page", note: "Page" }],
  support: "proven",
  access: "read",
  sensitivity: "none",
  auth: { observed: "unknown", evidence: [] },
  fingerprint: "a".repeat(64),
  related: [],
};
const manifest: Manifest = {
  manifestVersion: 1,
  generator: { name: "speeq", version: "dev" },
  project: { root: ".", framework: "nextjs-app", packageManager: "pnpm", language: "typescript" },
  capabilities: [route],
  diagnostics: [],
};
describe("manifest boundary", () => {
  it("round trips through the dedicated subpath", () => {
    expect(parseManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    for (const key of [
      "parseManifest",
      "parseDecisions",
      "resolveStatus",
      "MANIFEST_VERSION",
      "manifestSchema",
    ])
      expect(main).not.toHaveProperty(key);
  });
  it.each([
    ["duplicate", { capabilities: [route, route] }, ["capabilities", 1, "id"]],
    ["order", { capabilities: [{ ...route, id: "route:/z" }, route] }, ["capabilities", 1, "id"]],
    ["unknown field", { typo: 1 }, []],
    [
      "reason",
      { capabilities: [{ ...route, support: "needs-review" }] },
      ["capabilities", 0, "supportReason"],
    ],
    ["id", { capabilities: [{ ...route, id: "route:" }] }, ["capabilities", 0, "id"]],
    [
      "absolute",
      { capabilities: [{ ...route, source: { file: "/tmp/a", line: 1 } }] },
      ["capabilities", 0, "source", "file"],
    ],
    [
      "parent",
      { capabilities: [{ ...route, source: { file: "a/../b", line: 1 } }] },
      ["capabilities", 0, "source", "file"],
    ],
    [
      "fingerprint",
      { capabilities: [{ ...route, fingerprint: "xyz" }] },
      ["capabilities", 0, "fingerprint"],
    ],
  ] as const)("rejects %s at its issue path", (_, fields, path) => {
    expect(() => parseManifest({ ...manifest, ...fields })).toThrow(
      expect.objectContaining({
        name: "ZodError",
        issues: expect.arrayContaining([expect.objectContaining({ path })]),
      }),
    );
  });
  it("requires a fingerprint for approval", () => {
    expect(() =>
      parseDecisions({ decisionsVersion: 1, capabilities: { "route:/": { review: "approved" } } }),
    ).toThrow(/approvedFingerprint/);
  });
});

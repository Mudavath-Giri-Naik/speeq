import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { ANALYZER_VERSION, openRepoFs, scan } from "../src/index.js";
import { copyFixture, fixturePath, fixtures } from "./helpers.js";

const names = (await readdir(fixtures)).sort();
const json = (r: Awaited<ReturnType<typeof scan>>) =>
  r.status === "ok" ? JSON.stringify(r.manifest) : JSON.stringify(r);

it.each(names.filter((n) => n !== "monorepo-pnpm-two-apps"))(
  "gives the same result with and without a cache: %s",
  async (name) => {
    const cold = await scan({ root: fixturePath(name) });
    if (cold.status !== "ok") return;
    const warm = await scan({ root: fixturePath(name), cache: cold.cache });
    expect(json(warm)).toBe(json(cold));
    // Middleware files are read again on every scan, so they are the only files parsed.
    const listed = await (await openRepoFs({ root: fixturePath(name) })).listFiles();
    const middleware = listed.filter((f) => /(?:^|\/)(?:middleware|proxy)\.[a-z]+$/.test(f)).length;
    expect(warm.status === "ok" && warm.stats.filesParsed).toBeLessThanOrEqual(middleware);
    expect(warm.status === "ok" && warm.stats.reanalyzed).toEqual([]);
  },
);
it("is byte identical across runs and across directories", async () => {
  const a = json(await scan({ root: fixturePath("forms") }));
  expect(json(await scan({ root: fixturePath("forms") }))).toBe(a);
  const copy = await copyFixture("forms");
  try {
    expect(json(await scan({ root: copy.dir }))).toBe(a);
    expect(a).not.toContain(tmpdir());
    expect(a).not.toContain(fixtures);
  } finally {
    await copy.cleanup();
  }
});
it("reanalyzes a changed schema file and exactly the files that import it", async () => {
  const copy = await copyFixture("alias-barrel");
  try {
    const first = await scan({ root: copy.dir });
    if (first.status !== "ok") throw new Error("scan");
    await copy.write(
      "src/schemas/thing.ts",
      'import { z } from "zod";\nexport const Thing = z.object({ a: z.string(), extra: z.number() });',
    );
    const second = await scan({ root: copy.dir, cache: first.cache });
    if (second.status !== "ok") throw new Error("scan");
    expect(second.stats.reanalyzed.sort()).toEqual(["src/app/actions.ts", "src/schemas/thing.ts"]);
    const cold = await scan({ root: copy.dir });
    expect(json(second)).toBe(json(cold));
    const fn = second.manifest.capabilities.find((c) => c.id.endsWith("#viaStar"));
    expect(fn?.kind === "function" && fn.input?.schema.properties?.extra).toEqual({
      type: "number",
    });
    expect(fn?.fingerprint).not.toBe(
      first.manifest.capabilities.find((c) => c.id.endsWith("#viaStar"))?.fingerprint,
    );
  } finally {
    await copy.cleanup();
  }
});
it("handles added and deleted files and ignores caches from other settings", async () => {
  const copy = await copyFixture("next-app-minimal");
  try {
    const first = await scan({ root: copy.dir });
    if (first.status !== "ok") throw new Error("scan");
    await copy.write("app/extra/page.tsx", "export default function Page() {\n  return null;\n}");
    const added = await scan({ root: copy.dir, cache: first.cache });
    if (added.status !== "ok") throw new Error("scan");
    expect(added.manifest.capabilities.map((c) => c.id)).toContain("route:/extra");
    expect(added.stats.reanalyzed).toEqual(["app/extra/page.tsx"]);
    const stale = { ...first.cache, analyzerVersion: `${ANALYZER_VERSION}-old` };
    const ignored = await scan({ root: copy.dir, cache: stale });
    if (ignored.status !== "ok") throw new Error("scan");
    expect(ignored.stats.filesFromCache).toBe(0);
    const otherApp = await scan({ root: copy.dir, cache: { ...first.cache, appDir: "apps/x" } });
    if (otherApp.status !== "ok") throw new Error("scan");
    expect(otherApp.stats.filesFromCache).toBe(0);
  } finally {
    await copy.cleanup();
  }
});

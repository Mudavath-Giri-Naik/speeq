import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { openRepoFs } from "../src/index.js";
import { existingCalls } from "../src/project/existing-speeq.js";
import { inspectProject } from "../src/project/workspace.js";
import { parseSource } from "../src/ts/parse.js";

async function inspect(name: string, appDir?: string) {
  const fs = await openRepoFs({
    root: fileURLToPath(new URL(`../../../fixtures/compiler/${name}/`, import.meta.url)),
  });
  return inspectProject(fs, await fs.listFiles(), appDir);
}
it("resolves declared workspace packages, config extends and root-relative router paths", async () => {
  const { project } = await inspect("monorepo-npm-turbo-one-app");
  expect(project.packageManager).toBe("npm");
  expect(project.app?.appRouterDir).toBe("apps/web/app");
  expect(project.tsconfig?.baseUrl).toBe("packages/shared");
  expect(project.tsconfig?.aliases).toEqual([{ pattern: "shared", targets: ["index.ts"] }]);
});
it("requires selection among included pnpm apps", async () => {
  const p = await inspect("monorepo-pnpm-two-apps");
  expect(p.apps.map((a) => a.dir)).toEqual(["apps/a", "apps/b"]);
  expect(p.chosen).toBeUndefined();
  expect((await inspect("monorepo-pnpm-two-apps", "apps/b")).project.app?.pagesDir).toBe(
    "apps/b/pages",
  );
  await expect(inspect("next-app-src", "../escape")).rejects.toMatchObject({ code: "SQ0001" });
});
it.each([
  ["next-app-src", "typescript"],
  ["js-jsx-app", "javascript"],
  ["mixed-app", "mixed"],
])("classifies %s", async (name, lang) => {
  expect((await inspect(name)).project.language).toBe(lang);
});
it("distinguishes integration packages and existing call sites", async () => {
  const p = await inspect("integrations");
  expect(p.integrations).toHaveLength(47);
  expect(p.integrations.find((i) => i.package === "@langchain/langgraph")?.id).toBe("langgraph");
  const ast = parseSource("config.ts", "defineTool({}); defineRoute({}); // defineTool()");
  if (!ast) throw Error();
  expect(existingCalls(ast)).toEqual({ tools: 1, routes: 1 });
});

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RouteCapability } from "@speeq/core/manifest";
import { afterEach, expect, it } from "vitest";
import { scan } from "../src/index.js";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function app(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "speeq-filters-"));
  dirs.push(dir);
  for (const [f, text] of Object.entries({
    "package.json": JSON.stringify({ dependencies: { next: "^15.0.0" } }),
    ...files,
  })) {
    await mkdir(dirname(join(dir, f)), { recursive: true });
    await writeFile(join(dir, f), text);
  }
  const r = await scan({ root: dir });
  if (r.status !== "ok") throw new Error(r.status);
  return r;
}
const client = (keys: string[]) =>
  `"use client";\nimport { useSearchParams } from "next/navigation";\nexport default function List() {\n  const sp = useSearchParams();\n${keys.map((k) => `  const ${k} = sp.get("${k}");`).join("\n")}\n  return null;\n}\n`;

it("finds filters read in a client component the page imports from its own folder", async () => {
  const r = await app({
    "app/questions/page.tsx":
      'import List from "./QuestionsClient";\nexport default function Page() { return <List />; }\n',
    "app/questions/QuestionsClient.tsx":
      'import { Chips } from "./_components/chips";\n' +
      client(["subject", "difficulty"]).replace("return null;", "return <Chips />;"),
    "app/questions/_components/chips.tsx": client(["year"]).replace(
      "export default function List",
      "export function Chips",
    ),
  });
  const route = r.manifest.capabilities.find((c) => c.id === "route:/questions") as RouteCapability;
  expect(route.queryParams.map((p) => p.name).sort()).toEqual(["difficulty", "subject", "year"]);
  const filters = r.manifest.capabilities.find((c) => c.id === "filter-set:/questions");
  expect(filters?.evidence[0]).toMatchObject({
    file: "app/questions/QuestionsClient.tsx",
    detector: "use-search-params",
  });
});

it("never takes filters from shared components outside the page's folder", async () => {
  const r = await app({
    "components/Navbar.tsx": client(["ref"]),
    "app/about/page.tsx":
      'import Navbar from "../../components/Navbar";\nexport default function Page() { return <Navbar />; }\n',
  });
  const route = r.manifest.capabilities.find((c) => c.id === "route:/about") as RouteCapability;
  expect(route.queryParams).toEqual([]);
  expect(r.manifest.capabilities.find((c) => c.kind === "filter-set")).toBeUndefined();
});

it("rescans the page when only the client component changes", async () => {
  const files = {
    "app/questions/page.tsx":
      'import List from "./QuestionsClient";\nexport default function Page() { return <List />; }\n',
    "app/questions/QuestionsClient.tsx": client(["subject"]),
  };
  const first = await app(files);
  const dir = dirs[0] as string;
  await writeFile(join(dir, "app/questions/QuestionsClient.tsx"), client(["subject", "year"]));
  const warm = await scan({ root: dir, cache: first.cache });
  if (warm.status !== "ok") throw new Error(warm.status);
  const route = warm.manifest.capabilities.find(
    (c) => c.id === "route:/questions",
  ) as RouteCapability;
  expect(route.queryParams.map((p) => p.name).sort()).toEqual(["subject", "year"]);
});

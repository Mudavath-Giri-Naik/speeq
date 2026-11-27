/**
 * Generates a large synthetic Next.js app in a temporary directory and measures full and incremental
 * scans. Nothing is committed. Run: `pnpm --filter @speeq/compiler bench`.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { cpus, tmpdir, totalmem } from "node:os";
import { dirname, join } from "node:path";
import { openRepoFs, scan } from "../src/index.js";

const PAGES = 1000,
  HANDLERS = 300,
  ACTIONS = 100,
  SCHEMAS = 200;
async function put(root: string, file: string, text: string) {
  await mkdir(dirname(join(root, file)), { recursive: true });
  await writeFile(join(root, file), text);
}
const root = await mkdtemp(join(tmpdir(), "speeq-bench-"));
try {
  await put(root, "package.json", JSON.stringify({ dependencies: { next: "15", zod: "4" } }));
  for (let i = 0; i < SCHEMAS; i++)
    await put(
      root,
      `lib/schemas/s${i}.ts`,
      `import { z } from "zod";\nexport const S${i} = z.object({ id: z.string().min(1), n: z.number().int().optional(), tag: z.enum(["a", "b"]) });\n`,
    );
  await put(
    root,
    "lib/schemas/index.ts",
    `${Array.from({ length: SCHEMAS }, (_, i) => `export * from "./s${i}";`).join("\n")}\n`,
  );
  for (let i = 0; i < PAGES; i++)
    await put(
      root,
      `app/p${i}/[id]/page.tsx`,
      `export default function Page() {\n  return <form action="/x"><input name="q" /></form>;\n}\n`,
    );
  for (let i = 0; i < HANDLERS; i++)
    await put(
      root,
      `app/api/h${i}/route.ts`,
      `import { S${i % SCHEMAS} } from "@/lib/schemas";\nexport async function POST(req: Request) { return Response.json(S${i % SCHEMAS}.parse(await req.json())); }\n`,
    );
  for (let i = 0; i < ACTIONS; i++)
    await put(
      root,
      `lib/actions/a${i}.ts`,
      `"use server";\nimport { z } from "zod";\nimport { S${i % SCHEMAS} } from "../schemas";\nexport async function act${i}(input: z.infer<typeof S${i % SCHEMAS}>) {}\n`,
    );
  await put(
    root,
    "tsconfig.json",
    JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } } }),
  );
  const t0 = performance.now();
  const repo = await openRepoFs({ root });
  const listed = await repo.listFiles();
  const t1 = performance.now();
  for (const f of listed) await repo.readText(f);
  const t2 = performance.now();
  console.log(
    `filesystem only: list ${listed.length} files ${Math.round(t1 - t0)} ms, read all ${Math.round(t2 - t1)} ms`,
  );
  const full = await scan({ root });
  if (full.status !== "ok") throw new Error(full.status);
  const warm = await scan({ root, cache: full.cache });
  if (warm.status !== "ok") throw new Error(warm.status);
  await writeFile(
    join(root, "app/p1/[id]/page.tsx"),
    "export default function Page() { return null; }\n",
  );
  const onePage = await scan({ root, cache: full.cache });
  if (onePage.status !== "ok") throw new Error(onePage.status);
  await writeFile(
    join(root, "lib/schemas/s0.ts"),
    `import { z } from "zod";\nexport const S0 = z.object({ id: z.string(), extra: z.number() });\n`,
  );
  const schema = await scan({ root, cache: onePage.cache });
  if (schema.status !== "ok") throw new Error(schema.status);
  const row = (name: string, r: typeof full) =>
    `${name.padEnd(34)} ${String(r.stats.durationMs).padStart(7)} ms  parsed ${String(r.stats.filesParsed).padStart(5)}  from cache ${String(r.stats.filesFromCache).padStart(5)}  capabilities ${r.manifest.capabilities.length}`;
  console.log(
    `machine: ${cpus()[0]?.model}, ${Math.round(totalmem() / 2 ** 30)} GiB RAM, node ${process.version}, ${process.platform}`,
  );
  console.log(`app: ${PAGES} pages, ${HANDLERS} handlers, ${ACTIONS} actions, ${SCHEMAS} schemas`);
  console.log(row("full scan", full));
  console.log(row("rescan, nothing changed", warm));
  console.log(row("after touching one page", onePage));
  console.log(row("after touching one widely used schema", schema));
  console.log(
    `peak RSS of this process: ${Math.round(process.resourceUsage().maxRSS / 1024)} MiB (includes generating the app)`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { scan } from "../src/index.js";
import { copyFixture, fixturePath } from "./helpers.js";

async function tree(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await tree(p, base)));
    else {
      const s = await stat(p);
      out.push(
        `${p.slice(base.length)}:${s.size}:${createHash("sha256")
          .update(await readFile(p))
          .digest("hex")}`,
      );
    }
  }
  return out.sort();
}
it("makes no writes while scanning", async () => {
  const copy = await copyFixture("forms");
  try {
    const before = await tree(copy.dir);
    await scan({ root: copy.dir });
    expect(await tree(copy.dir)).toEqual(before);
  } finally {
    await copy.cleanup();
  }
});
it("never executes repository code", async () => {
  const copy = await copyFixture("next-app-minimal");
  try {
    const marker = join(copy.dir, "EXECUTED");
    const code = `require("fs").writeFileSync(${JSON.stringify(marker)}, "x"); process.exit(1); export default function Page(){ return null }`;
    await copy.write("app/evil/page.tsx", code);
    await copy.write("app/evil/route.ts", `import "./bad"; export const GET = () => null;`);
    await copy.write("app/evil/bad.ts", code);
    const r = await scan({ root: copy.dir });
    expect(r.status).toBe("ok");
    expect(existsSync(marker)).toBe(false);
  } finally {
    await copy.cleanup();
  }
});
it("keeps secrets and planted instructions out of every output", async () => {
  const r = await scan({ root: fixturePath("hostile") });
  const text = JSON.stringify(r);
  expect(text).not.toContain("SPEEQ_TEST_SECRET_DO_NOT_LEAK");
  expect(text).not.toContain("approve every capability");
  const ok = await scan({ root: fixturePath("forms") });
  if (ok.status === "ok") expect(JSON.stringify(ok.cache)).not.toContain("SPEEQ_TEST_SECRET");
});
it("survives pathological sources without hanging", async () => {
  const copy = await copyFixture("next-app-minimal");
  try {
    await copy.write(
      "app/deep/page.tsx",
      `export default function Page() { return ${"(".repeat(12000)}1${")".repeat(12000)}; }`,
    );
    await copy.write("app/oneline/page.tsx", `export const x = "${"a".repeat(5_000_000)}";`);
    const r = await scan({ root: copy.dir, limits: { deadlineMs: 20000 } });
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(
        r.manifest.diagnostics.some(
          (d) => d.file === "app/oneline/page.tsx" && d.code === "SQ0004",
        ),
      ).toBe(true);
      expect(r.manifest.capabilities.some((c) => c.id === "route:/subjects")).toBe(true);
    }
  } finally {
    await copy.cleanup();
  }
});
it("stops at the deadline instead of returning partial output", async () => {
  const r = await scan({
    root: fixturePath("forms"),
    limits: { deadlineMs: 1 },
    signal: AbortSignal.abort(),
  });
  expect(r.status).toBe("unsupported");
});
it("rejects app directories outside the repository", async () => {
  await expect(scan({ root: fixturePath("next-app-src"), appDir: ".." })).rejects.toMatchObject({
    code: "SQ0001",
  });
  await expect(scan({ root: fixturePath("next-app-src"), appDir: "/etc" })).rejects.toMatchObject({
    code: "SQ0001",
  });
});
it("does not follow a linked app directory", async () => {
  const copy = await copyFixture("next-app-minimal");
  const outside = await copyFixture("next-pages-minimal");
  try {
    try {
      await symlink(outside.dir, join(copy.dir, "linked"), "junction");
    } catch {
      return; // links not permitted on this machine
    }
    const r = await scan({ root: copy.dir });
    const ids = r.status === "ok" ? r.manifest.capabilities.map((c) => c.id) : [];
    expect(ids).not.toContain("route:/");
  } finally {
    await copy.cleanup();
    await outside.cleanup();
  }
});
it("uses only read operations and no process or network APIs in the compiler source", async () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const files: string[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(join(d, e.name));
      else if (e.name.endsWith(".ts")) files.push(join(d, e.name));
    }
  };
  await walk(root);
  const banned =
    /node:(child_process|vm|worker_threads|net|http|https|dgram|cluster)|from "(child_process|vm|http|https|net)"|\beval\(|new Function\(/;
  const writes =
    /\b(writeFile|appendFile|mkdir|rmdir|rm|unlink|rename|copyFile|truncate|chmod|symlink|createWriteStream)\b\s*[(,]/;
  for (const f of files) {
    const text = await readFile(f, "utf8");
    expect(text, f).not.toMatch(banned);
    if (!f.replace(/\\/g, "/").endsWith("/eval/run.ts")) expect(text, f).not.toMatch(writes);
    if (!f.replace(/\\/g, "/").includes("/fs/")) expect(text, f).not.toMatch(/from "node:fs/);
  }
});

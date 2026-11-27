import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openRepoFs } from "../src/fs/repo-fs.js";

let temp: string, root: string;
beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), "speeq-fs-"));
  root = join(temp, "repo");
  await mkdir(root);
});
afterEach(async () => {
  await rm(temp, { force: true, recursive: true });
});
it("enforces containment and denied names for listing, reads and existence", async () => {
  const fs = await openRepoFs({ root });
  await mkdir(join(root, ".git"));
  for (const p of [
    ".env",
    ".env.local",
    ".env.example",
    "key.pem",
    ".git/config",
    "credentials-app.json",
  ]) {
    await writeFile(join(root, p), "fake");
    await expect(fs.readText(p)).rejects.toMatchObject({ code: "SQ0002" });
    expect(await fs.exists(p)).toBe(false);
  }
  for (const p of ["../outside", join(temp, "outside"), "C:\\outside"]) {
    await expect(fs.readText(p)).rejects.toMatchObject({ code: "SQ0001" });
    expect(await fs.exists(p)).toBe(false);
  }
  expect(await fs.listFiles()).toEqual([]);
});
it("applies nested ignores and negation with portable deterministic paths", async () => {
  for (const dir of ["src", "node_modules", ".next"]) await mkdir(join(root, dir));
  for (const p of [
    "src/keep.tmp",
    "src/drop.tmp",
    "src/東京.ts",
    ".next/out",
    "node_modules/pkg",
    "a.ts",
  ])
    await writeFile(join(root, p), p);
  await writeFile(join(root, ".gitignore"), "*.tmp\n");
  await writeFile(join(root, "src/.gitignore"), "!keep.tmp\n");
  const fs = await openRepoFs({ root });
  const expected = [".gitignore", "a.ts", "src/.gitignore", "src/keep.tmp", "src/東京.ts"];
  expect(await fs.listFiles()).toEqual(expected);
  expect(await fs.listFiles()).toEqual(expected);
  expect(await fs.readText("src\\東京.ts")).toBe("src/東京.ts");
  expect(await fs.exists("src/drop.tmp")).toBe(false);
  await expect(fs.readText("src/drop.tmp")).rejects.toMatchObject({ code: "SQ0002" });
});
for (const type of ["file", "dir"] as const)
  it(`skips ${type} symlinks`, async (ctx) => {
    const target = join(temp, "outside");
    if (type === "dir") {
      await mkdir(target);
      await writeFile(join(target, "item"), "outside");
    } else await writeFile(target, "outside");
    try {
      await symlink(target, join(root, "link"), type);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EPERM") throw e;
      if (type === "dir" && process.platform === "win32")
        await symlink(target, join(root, "link"), "junction");
      else return ctx.skip("OS denied symlink creation");
    }
    const fs = await openRepoFs({ root });
    expect(await fs.listFiles()).toEqual([]);
    await expect(fs.readText(type === "dir" ? "link/item" : "link")).rejects.toMatchObject({
      code: "SQ0003",
    });
    expect(fs.diagnostics).toContainEqual(
      expect.objectContaining({ code: "SQ0003", file: "link" }),
    );
  });
it("stops at file and byte limits and observes cancellation", async () => {
  await writeFile(join(root, "a"), "aaa");
  await writeFile(join(root, "b"), "b");
  const fs = await openRepoFs({ root, maxFileBytes: 2, maxFiles: 1 });
  expect(await fs.listFiles()).toEqual([]);
  await expect(fs.readText("a")).rejects.toMatchObject({ code: "SQ0004" });
  expect(fs.diagnostics.map((d) => d.code)).toEqual(["SQ0004", "SQ0005"]);
  const ctl = new AbortController();
  const stopped = await openRepoFs({ root, signal: ctl.signal });
  ctl.abort();
  await expect(stopped.listFiles()).rejects.toMatchObject({ code: "SQ0006" });
  await expect(stopped.readText("b")).rejects.toMatchObject({ code: "SQ0006" });
});
it("keeps the hostile fixture secret outside all returned data", async () => {
  const fs = await openRepoFs({
    root: fileURLToPath(new URL("../../../fixtures/compiler/hostile/", import.meta.url)),
  });
  const files = await fs.listFiles();
  expect(files).not.toContain("link-placeholder.txt");
  expect(files).not.toContain(".env");
  expect(await readFile(join(fs.root, ".env"), "utf8")).toContain("SPEEQ_TEST_SECRET_DO_NOT_LEAK");
  expect(files).not.toContain("large.txt");
  expect(fs.diagnostics).toContainEqual(
    expect.objectContaining({ code: "SQ0004", file: "large.txt" }),
  );
  await expect(fs.readText(".env")).rejects.toMatchObject({ code: "SQ0002" });
  expect(
    JSON.stringify([
      files,
      fs.diagnostics,
      ...(await Promise.all(files.map((f) => fs.readText(f)))),
    ]),
  ).not.toContain("SPEEQ_TEST_SECRET_DO_NOT_LEAK");
});

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ScanOptions, scan } from "../src/index.js";

/** Absolute path of the fixture corpus. */
export const fixtures = fileURLToPath(new URL("../../../fixtures/compiler/", import.meta.url));
/** Absolute path of one fixture. */
export const fixturePath = (name: string) => join(fixtures, name);
/** Scan a fixture and require a manifest. */
export async function scanFixture(name: string, options: Partial<ScanOptions> = {}) {
  const r = await scan({ root: fixturePath(name), ...options });
  if (r.status !== "ok") throw new Error(`${name}: ${r.status}`);
  return r;
}
/** Copy a fixture into a fresh temporary directory. */
export async function copyFixture(name: string) {
  const dir = await mkdtemp(join(tmpdir(), "speeq-fixture-"));
  await cp(fixturePath(name), dir, { recursive: true });
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
    write: async (file: string, text: string) => {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), text);
    },
    read: (file: string) => readFile(join(dir, file), "utf8"),
  };
}
/** Find a capability by id or fail. */
export function find<T extends { id: string }>(list: readonly T[], id: string): T {
  const hit = list.find((c) => c.id === id);
  if (!hit) throw new Error(`missing ${id}`);
  return hit;
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  assignToolNames,
  canonicalJson,
  capabilityId,
  diagnostics,
  fingerprint,
  parseCapabilityId,
} from "../src/index.js";

it("round trips framework identities and assigns bounded, distinct names deterministically", () => {
  const id = capabilityId("endpoint", "GET /api/:slug");
  expect(parseCapabilityId(id)).toEqual({ kind: "endpoint", key: "GET /api/:slug" });
  expect(() => parseCapabilityId("bad:val")).toThrow();
  const ids = [
    "route:/a_b",
    "route:/a/b",
    `route:/${"x".repeat(100)}`,
    `route:/${"x".repeat(101)}`,
  ];
  const names = assignToolNames(ids);
  expect(names).toEqual(assignToolNames(ids.reverse()));
  expect(new Set(names.values()).size).toBe(4);
  for (const name of names.values()) expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
});
it("hashes canonical JSON and rejects non-JSON data", () => {
  expect(canonicalJson({ b: 1, a: { z: 2, b: 3 } })).toBe('{"a":{"b":3,"z":2},"b":1}');
  expect(fingerprint({ b: 1, a: 2 })).toBe(fingerprint({ a: 2, b: 1 }));
  expect(fingerprint({})).toBe("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  const cycle: unknown[] = [];
  cycle.push(cycle);
  for (const v of [undefined, { x: () => 3 }, cycle]) expect(() => canonicalJson(v)).toThrow();
});
it("registers every diagnostic code used anywhere in compiler source", async () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const content = await readFile(join(entry.parentPath, entry.name), "utf8");
    for (const [code] of content.matchAll(/\bSQ\d{4}\b/g)) expect(diagnostics).toHaveProperty(code);
  }
});

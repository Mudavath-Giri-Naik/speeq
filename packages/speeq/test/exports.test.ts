import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import pkg from "../package.json";

for (const [subpath, conditions] of Object.entries(pkg.exports)) {
  const path = subpath.slice(1);
  const target = `@speeq/${path.slice(1) || "core"}`;
  for (const format of ["import", "require"] as const) {
    it(`matches ${target} through ${format}("speeq${path}")`, () => {
      const load = format === "import" ? "await import" : "require";
      const code = `import assert from "node:assert/strict"; import {createRequire} from "node:module"; const require=createRequire(import.meta.url);
      assert.deepEqual(Object.keys(${load}("speeq${path}")).sort(),Object.keys(${load}("${target}")).sort());`;
      execFileSync(process.execPath, ["--input-type=module", "-e", code]);
      if (path === "/client" || path === "/react") {
        const js = readFileSync(conditions[format].default, "utf8");
        expect(js).not.toContain("@speeq/server");
        const types = readFileSync(conditions[format].types, "utf8").trim();
        expect(types).toBe(`export * from '${target}';`);
        const imports = Array.from(
          js.matchAll(/(?:from\s*|require\(\s*|import\s*)["']([^"']+)["']/g),
          (m) => m[1],
        );
        expect(imports).toContain(target);
        expect(
          imports.every((name) =>
            ["@speeq/client", "@speeq/react", "@speeq/core", "react"].includes(name ?? ""),
          ),
        ).toBe(true);
      }
    });
  }
}

it("declares optional integration peers", () => {
  expect(pkg.peerDependenciesMeta).toEqual({
    react: { optional: true },
    mongodb: { optional: true },
  });
});

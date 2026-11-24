import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPackage, checkRepo, packageNameOf } from "./check-deps-direction.js";

const root = join(fileURLToPath(import.meta.url), "..", "..");

describe("dependency direction", () => {
  it("the repository follows the rules", () => {
    expect(checkRepo(root)).toEqual([]);
  });

  it("parses package names from specifiers", () => {
    expect(packageNameOf("@speeq/core/errors")).toBe("@speeq/core");
    expect(packageNameOf("zod")).toBe("zod");
    expect(packageNameOf("./x.js")).toBeNull();
    expect(packageNameOf("node:fs")).toBeNull();
  });

  it("flags core depending on server", () => {
    const problems = checkPackage({
      dir: "x",
      manifest: { name: "@speeq/core", dependencies: { "@speeq/server": "0.0.0" } },
      sources: [{ file: "a.ts", code: `import { x } from "@speeq/server";` }],
    });
    expect(problems).toHaveLength(2);
  });

  it("flags a runtime dependency in client", () => {
    const problems = checkPackage({
      dir: "x",
      manifest: { name: "@speeq/client", dependencies: { "@speeq/core": "0.0.0" } },
      sources: [],
    });
    expect(problems[0]).toMatch(/not allowed/);
  });

  it("flags adapters importing server", () => {
    const problems = checkPackage({
      dir: "x",
      manifest: { name: "@speeq/store-memory" },
      sources: [{ file: "a.ts", code: `export * from "@speeq/server";` }],
    });
    expect(problems).toHaveLength(1);
  });

  it("flags an undeclared third-party import", () => {
    const problems = checkPackage({
      dir: "x",
      manifest: { name: "@speeq/core", peerDependencies: { zod: "^4" } },
      sources: [{ file: "a.ts", code: `import lodash from "lodash";\nimport { z } from "zod";` }],
    });
    expect(problems).toEqual([`@speeq/core: a.ts imports "lodash" (not allowed)`]);
  });
});

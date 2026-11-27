import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPackage, checkRepo, packageNameOf } from "./check-deps-direction.js";

import { RULES } from "./deps-rules.js";

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

  it("rejects the umbrella as a scoped dependency or import", () => {
    expect(
      checkPackage({
        dir: "x",
        manifest: { name: "@speeq/core", dependencies: { speeq: "*" } },
        sources: [{ file: "x.ts", code: 'import "speeq/client";' }],
      }),
    ).toHaveLength(2);
  });

  it("allows the umbrella to re-export all scoped packages", () => {
    const names = Object.keys(RULES).filter((name) => name !== "@speeq/compiler");
    expect(
      checkPackage({
        dir: "x",
        manifest: {
          name: "speeq",
          dependencies: Object.fromEntries(names.map((n) => [n, "workspace:*"])),
        },
        sources: names.map((name) => ({ file: "x.ts", code: `export * from "${name}";` })),
      }),
    ).toEqual([]);
  });

  it("keeps development tooling out of every runtime package", () => {
    for (const name of [
      ...Object.keys(RULES).filter((n) => n !== "@speeq/compiler"),
      "@speeq/speech",
      "speeq",
    ]) {
      for (const tool of ["@speeq/compiler", "@speeq/integrate", "@speeq/cli"]) {
        expect(
          checkPackage({
            dir: "x",
            manifest: { name, dependencies: { [tool]: "*" } },
            sources: [{ file: "src/x.ts", code: `import "${tool}/subpath";` }],
          }),
        ).toHaveLength(2);
      }
    }
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

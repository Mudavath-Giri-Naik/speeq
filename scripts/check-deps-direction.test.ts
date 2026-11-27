import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkPackage, checkRepo, packageNameOf } from "./check-deps-direction.js";

import { RULES } from "./deps-rules.js";

const root = join(fileURLToPath(import.meta.url), "..", "..");

const DEV_ONLY = ["@speeq/compiler", "@speeq/integrate", "@speeq/cli"];

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
    const names = Object.keys(RULES).filter((name) => !DEV_ONLY.includes(name));
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
      ...Object.keys(RULES).filter((n) => !DEV_ONLY.includes(n)),
      "@speeq/speech",
      "speeq",
    ]) {
      for (const tool of ["@speeq/compiler", "@speeq/integrate", "@speeq/cli"]) {
        // The umbrella ships the `speeq` executable, a shim over the CLI (ADR-0014).
        if (name === "speeq" && tool === "@speeq/cli") continue;
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

  it("checks optional runtime dependencies and CommonJS imports", () => {
    expect(
      checkPackage({
        dir: "x",
        manifest: { name: "speeq", optionalDependencies: { "@speeq/compiler": "*" } },
        sources: [{ file: "x.ts", code: 'require("@speeq/integrate");' }],
      }),
    ).toHaveLength(2);
  });

  it("lets the umbrella depend on and import only the CLI for its executable", () => {
    expect(
      checkPackage({
        dir: "x",
        manifest: { name: "speeq", dependencies: { "@speeq/cli": "workspace:*" } },
        sources: [{ file: "src/bin.ts", code: 'await import("@speeq/cli");' }],
      }),
    ).toEqual([]);
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

import { cp, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "@speeq/compiler";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { applyPlan, buildPlan, nodeFs, setDecision } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../../fixtures/compiler");
const norm = (s: string) => s.split("\\").join("/");

/** Generated code must compile against the real speeq packages, or `next build` would break. */
const umbrella = join(here, "..", "..", "speeq", "src");

describe("generated code", () => {
  it("type-checks against the real packages", async () => {
    const dir = await mkdtemp(join(here, "..", ".gen-"));
    try {
      await cp(join(fixtures, "server-actions"), dir, { recursive: true });
      const r = await scan({ root: dir });
      if (r.status !== "ok") throw new Error(r.status);
      let d = setDecision(undefined, r.manifest, "function:app/actions.ts#addItem", "enable", {
        auth: { requirement: "roles", roles: ["admin"] },
      });
      d = setDecision(d, r.manifest, "function:app/lib/tagged.ts#tagged", "enable", {
        auth: { requirement: "public" },
      });
      d = setDecision(d, r.manifest, "route:/inline", "enable");
      const fs = nodeFs(dir);
      const plan = await buildPlan({
        manifest: r.manifest,
        decisions: d,
        fs,
        options: { prefix: "", appRouterDir: "app", speeqVersion: "0.4.0" },
      });
      expect((await applyPlan(fs, plan)).status).toBe("applied");
      const roots = [
        ".speeq/generated/tools.ts",
        ".speeq/generated/routes.ts",
        "speeq.config.ts",
        "app/api/speeq/[[...speeq]]/route.ts",
      ].map((f) => join(dir, f));
      const program = ts.createProgram(roots, {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        customConditions: ["@speeq/source"],
        // The umbrella is not a dependency of this package (it depends on the CLI): map it by path.
        paths: {
          "speeq/server/next": [join(umbrella, "server-next.ts")],
          "speeq/*": [join(umbrella, "*.ts")],
        },
        types: ["node"],
        lib: ["lib.es2023.d.ts", "lib.dom.d.ts"],
      });
      const base = norm(dir);
      const errors = ts
        .getPreEmitDiagnostics(program)
        .filter((x) => x.file && norm(x.file.fileName).startsWith(base))
        .map((x) => `${x.file?.fileName}: ${ts.flattenDiagnosticMessageText(x.messageText, "\n")}`);
      expect(errors).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

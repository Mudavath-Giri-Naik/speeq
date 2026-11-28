import type { DecisionsFile, Manifest } from "@speeq/core/manifest";
import { afterEach, describe, expect, it } from "vitest";
import { applyPlan, type Level, ownership, verifyProject, writeDecisions } from "../src/index.js";
import { project, snapshot } from "./helpers.js";

type P = Awaited<ReturnType<typeof project>>;
type Report = Awaited<ReturnType<typeof verifyProject>>;
const open: P[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((p) => p.cleanup()));
});
const ADD = "function:app/actions.ts#addItem";
const PARSED = "function:app/actions.ts#parsed";
const NOINPUT = "function:app/actions.ts#noInput";
const ARROW = "function:app/actions.ts#arrow";
const DEPS = { dependencies: { next: "15", zod: "4", speeq: "0.4.0" } };

/** Server-actions fixture, initialised with four decisions that cover every permission shape. */
async function integrated(extra: { noConfirm?: boolean } = {}) {
  const p = await project("server-actions");
  open.push(p);
  let d: DecisionsFile | undefined;
  d = p.approve(d, ADD, { auth: { requirement: "roles", roles: ["admin"] } });
  d = p.approve(d, PARSED, { access: "read", auth: { requirement: "authenticated" } });
  d = p.approve(d, NOINPUT, { access: "read" });
  d = p.approve(d, ARROW, { access: "write", ...(extra.noConfirm ? { confirm: false } : {}) });
  await writeDecisions(p.fs, p.options.prefix, d);
  const applied = await applyPlan(p.fs, await p.plan(d));
  expect(applied.status).toBe("applied");
  await p.write("package.json", JSON.stringify(DEPS));
  return p;
}
const verify = (p: P, levels: Level[] = ["static", "runtime"], more = {}) =>
  verifyProject({
    fs: p.fs,
    manifest: p.manifest as Manifest,
    options: p.options,
    levels,
    env: { SPEEQ_SECRET: "x" },
    ...more,
  });
const status = (r: Report, id: string) => r.checks.find((c) => c.id === id)?.status;

describe("verify", () => {
  it("passes static and runtime on a clean integration and writes nothing", async () => {
    const p = await integrated();
    const before = await snapshot(p.dir);
    const r = await verify(p);
    expect(r.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(r.levels).toEqual({ static: "pass", runtime: "pass", host: "not-run" });
    expect(r.ok).toBe(true);
    expect(
      r.checks.filter((c) => c.level === "runtime" && /^R\d/.test(c.id)).map((c) => c.id),
    ).toEqual(["R1", "R2", "R3", "R4", "R5", "R6", "R7"]);
    expect(await snapshot(p.dir)).toEqual(before);
  });

  it("an edited generated file fails S1, is not run and the level is not-run", async () => {
    const p = await integrated();
    const f = ".speeq/generated/tools.ts";
    await p.write(f, `${await p.read(f)}// hand edit\n`);
    const r = await verify(p);
    expect(status(r, "S1.tools")).toBe("fail");
    expect(r.checks.filter((c) => c.level === "runtime").every((c) => c.status === "skip")).toBe(
      true,
    );
    expect(r.levels.runtime).toBe("not-run");
    expect(r.ok).toBe(false);
  });

  it("a file whose marker was removed is a warning and is not run", async () => {
    const p = await integrated();
    const f = ".speeq/generated/tools.ts";
    const text = await p.read(f);
    await p.write(f, text.slice(text.indexOf("\n") + 1));
    expect(ownership(await p.read(f))).toBe("foreign");
    const r = await verify(p);
    expect(status(r, "S1.tools")).toBe("warn");
    expect(status(r, "R1")).toBe("skip");
    expect(r.ok).toBe(true);
  });

  it("reports a missing config export, missing dependencies, a stale manifest and invalid decisions", async () => {
    const p = await integrated();
    await p.write("speeq.config.ts", "export default {};\n");
    await p.write("package.json", JSON.stringify({ dependencies: { next: "15" } }));
    await p.write(".speeq/manifest.json", "{}\n");
    let r = await verify(p, ["static"]);
    expect(status(r, "S5")).toBe("fail");
    expect(status(r, "S9")).toBe("fail");
    expect(status(r, "S2")).toBe("fail");
    await p.write(".speeq/decisions.json", "{ nope");
    r = await verify(p, ["static"]);
    expect(status(r, "S3")).toBe("fail");
  });

  it("a deleted generated file fails S1 and the runtime level does not run", async () => {
    const p = await integrated();
    await p.fs.remove(".speeq/generated/routes.ts");
    const r = await verify(p);
    expect(status(r, "S1.routes")).toBe("fail");
    expect(r.levels.runtime).toBe("not-run");
  });

  it("changed code makes S2 fail until the manifest is refreshed", async () => {
    const p = await integrated();
    const text = await p.read("app/actions.ts");
    await p.write(
      "app/actions.ts",
      `${text}\nexport async function another(input: { id: string }) {}\n`,
    );
    await p.scan();
    expect(status(await verify(p, ["static"]), "S2")).toBe("fail");
  });

  it("a capability waiting for review makes reviewPending true without failing", async () => {
    const p = await integrated();
    const r = await verify(p, ["static"]);
    expect(r.reviewPending).toBe(true);
    expect(status(r, "S10")).toBe("warn");
    expect(r.ok).toBe(true);
  });

  it("warns when a write tool has confirmation turned off", async () => {
    const p = await integrated({ noConfirm: true });
    const r = await verify(p);
    expect(status(r, "R7")).toBe("warn");
    expect(r.checks.find((c) => c.id === "R7")?.detail).toMatch(/arrow/);
    expect(r.ok).toBe(true);
    expect(status(await verify(await integrated()), "R7")).toBe("pass");
  });

  it("checks confirmation and every permission shape end to end", async () => {
    const p = await integrated();
    const r = await verify(p);
    expect(r.checks.find((c) => c.id === "R4")?.detail).toBe("2 write tools");
    expect(r.checks.find((c) => c.id === "R5")?.detail).toMatch(/4 tools checked/);
    expect(r.checks.find((c) => c.id === "R6")?.detail).toBe("status 404");
  });

  it("catches generated code that lost its guard", async () => {
    const p = await integrated();
    const { seal } = await import("../src/index.js");
    const f = ".speeq/generated/tools.ts";
    const text = await p.read(f);
    const body = text.slice(text.indexOf("\n") + 1).replace(/guard\(ctx[^;]*; /g, "");
    expect(body).not.toBe(text.slice(text.indexOf("\n") + 1));
    await p.write(f, seal(body));
    const r = await verify(p);
    expect(status(r, "S1.tools")).toBe("pass");
    expect(status(r, "R5")).toBe("fail");
    expect(r.checks.find((c) => c.id === "R5")?.detail).toMatch(/anonymous not blocked/);
  });

  it("catches a write tool that lost its confirmation", async () => {
    const p = await integrated();
    const { seal } = await import("../src/index.js");
    const f = ".speeq/generated/tools.ts";
    const text = await p.read(f);
    const body = text
      .slice(text.indexOf("\n") + 1)
      .replace(/ {4}risk: "write",\n/g, "")
      .replace(/ {4}confirmationSummary: .*\n/g, "");
    await p.write(f, seal(body));
    const r = await verify(p);
    expect(status(r, "R4")).toBe("fail");
  });

  it("environment names come from process env or .env files and values are never reported", async () => {
    const p = await integrated();
    const only = (env: Record<string, string>) =>
      verifyProject({
        fs: p.fs,
        manifest: p.manifest as Manifest,
        options: p.options,
        levels: ["static"],
        env,
      });
    await p.write(".env.local", "SPEEQ_SECRET=super-secret-value-123\n");
    const r = await only({});
    expect(status(r, "S8")).toBe("pass");
    expect(JSON.stringify(r)).not.toContain("super-secret-value-123");
    await p.write(".env.local", "SPEEQ_SECRET=\n");
    expect(status(await only({}), "S8")).toBe("warn");
  });

  it("host: runs only when asked, through the runner, and a failing command fails the level", async () => {
    const p = await integrated();
    await p.write(
      "package.json",
      JSON.stringify({ scripts: { typecheck: "tsc --noEmit" }, ...DEPS }),
    );
    const calls: string[] = [];
    const run = async (c: string, a: string[]) => {
      calls.push(`${c} ${a.join(" ")}`);
      return 1;
    };
    const without = await verify(p, ["static"], { run });
    expect(calls).toEqual([]);
    expect(without.levels.host).toBe("not-run");
    const r = await verify(p, ["static", "host"], { run });
    expect(calls).toHaveLength(1);
    expect(r.levels.host).toBe("fail");
    expect(r.ok).toBe(false);
    expect((await verify(p, ["host"])).levels.host).toBe("not-run");
    expect((await verify(p, ["host"], { run: async () => 0 })).levels.host).toBe("pass");
  });
});

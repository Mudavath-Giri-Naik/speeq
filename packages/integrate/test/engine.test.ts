import type { DecisionsFile } from "@speeq/core/manifest";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPlan,
  IntegrateError,
  isEmptyPlan,
  readDecisions,
  rollback,
  serializeDecisions,
  setDecision,
  writeDecisions,
} from "../src/index.js";
import { project, snapshot, spyFs } from "./helpers.js";

type P = Awaited<ReturnType<typeof project>>;
const open: P[] = [];
async function make(name: string) {
  const p = await project(name);
  open.push(p);
  return p;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((p) => p.cleanup()));
});
const ADD = "function:app/actions.ts#addItem";
const TAGGED = "function:app/lib/tagged.ts#tagged";
const ROUTE = "route:/inline";
async function approved(p: P, ids = [ADD, TAGGED, ROUTE]) {
  let d: DecisionsFile | undefined;
  for (const id of ids) d = p.approve(d, id);
  return d;
}

describe("plan", () => {
  it("wraps approved capabilities and reports the rest", async () => {
    const p = await make("server-actions");
    const plan = await p.plan(await approved(p));
    expect(plan.wrapped.map((w) => w.id).sort()).toEqual([ADD, ROUTE, TAGGED].sort());
    expect(plan.pending).toContain("function:app/actions.ts#arrow");
    const paths = plan.changes.map((c) => c.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        ".speeq/manifest.json",
        ".speeq/generated/tools.ts",
        ".speeq/generated/routes.ts",
        "speeq.config.ts",
        "app/api/speeq/[[...speeq]]/route.ts",
      ]),
    );
    const tools = plan.changes.find((c) => c.path.endsWith("tools.ts"))?.content ?? "";
    expect(tools.startsWith("// speeq:generated sha256=")).toBe(true);
    expect(tools).toContain('risk: "write"');
    expect(tools).toContain('from "../../app/actions"');
    expect(plan.dependencies.map((d) => d.name)).toContain("speeq");
    expect(plan.manual.map((m) => m.title)).toContain("Add the provider to your root layout");
    expect(plan.env.map((e) => e.name)).toContain("SPEEQ_SECRET");
  });
  it("building a plan writes nothing", async () => {
    const p = await make("server-actions");
    const before = await snapshot(p.dir);
    const { fs, log } = spyFs(p.fs);
    const { buildPlan } = await import("../src/index.js");
    await buildPlan({
      manifest: p.manifest ?? (await p.scan()),
      decisions: await approved(p),
      fs,
      options: { prefix: "", appRouterDir: "app", speeqVersion: "0.4.0" },
    });
    expect(log).toEqual([]);
    expect(await snapshot(p.dir)).toEqual(before);
  });
  it("renders endpoints through bindEndpoint with fixed path and no auth forwarding by default", async () => {
    const p = await make("endpoints-input");
    let d = p.approve(undefined, "endpoint:GET /api/query", { access: "read" });
    d = p.approve(d, "endpoint:GET /api/items/[id]", { access: "read", forwardAuth: true });
    const plan = await p.plan(d);
    const tools = plan.changes.find((c) => c.path.endsWith("tools.ts"))?.content ?? "";
    expect(tools).toContain('path: "/api/query"');
    expect(tools).toContain("forwardAuth: false");
    if (plan.wrapped.some((w) => w.id.includes("items"))) {
      expect(tools).toContain('path: "/api/items/:id"');
      expect(tools).toContain("forwardAuth: true");
    }
    expect(plan.env.map((e) => e.name)).toContain("SPEEQ_BASE_URL");
  });
  it("skips an endpoint whose access is unknown, and one needing an auth decision", async () => {
    const p = await make("endpoints-input");
    const d = p.approve(undefined, "endpoint:GET /api/query");
    const plan = await p.plan(d);
    expect(plan.wrapped).toEqual([]);
    expect(plan.skipped[0]?.reason).toMatch(/Access is unknown/);
    const none = { ...p.approve(undefined, "endpoint:GET /api/query", { access: "read" }) };
    const noAuth = structuredClone(none) as DecisionsFile;
    delete (noAuth.capabilities["endpoint:GET /api/query"] as { auth?: unknown }).auth;
    // nothing observed and not sensitive: a missing auth decision is allowed
    expect((await p.plan(noAuth)).wrapped).toHaveLength(1);
    const wrapped = await p.plan(
      p.approve(undefined, "endpoint:GET /api/wrapped", { access: "read", auth: undefined }),
    );
    expect(wrapped.wrapped).toEqual([]);
  });
  it("never wraps credentials and refuses to enable them", async () => {
    const p = await make("endpoints-input");
    const m = p.manifest ?? (await p.scan());
    expect(() => setDecision(undefined, m, "endpoint:POST /api/pay", "enable")).toThrow(
      IntegrateError,
    );
    expect(() => setDecision(undefined, m, "nope:x", "enable")).toThrow(/No capability/);
  });
  it("skips a schema it cannot render, such as one with a secret-named field", async () => {
    const p = await make("server-actions");
    const m = await p.scan();
    const c = m.capabilities.find((x) => x.id === ADD);
    if (c?.kind !== "function" || !c.input) throw new Error("fixture changed");
    c.input.schema.properties = { ...c.input.schema.properties, apiToken: { type: "string" } };
    const plan = await p.plan(await approved(p, [ADD]));
    expect(plan.wrapped).toEqual([]);
    expect(plan.skipped[0]?.reason).toMatch(/secret/);
  });
  it("puts catch-all routes and forms in skipped, never wrapped", async () => {
    const p = await make("routes-advanced");
    const plan = await p.plan(
      p.approve(p.approve(undefined, "route:/docs/[...slug]"), "route:/products/[id]"),
    );
    expect(plan.wrapped.map((w) => w.id)).toEqual(["route:/products/[id]"]);
    expect(plan.skipped.some((s) => s.id === "route:/docs/[...slug]")).toBe(true);
    const routes = plan.changes.find((c) => c.path.endsWith("routes.ts"))?.content ?? "";
    expect(routes).toContain('path: "/products/:id"');
  });
});

describe("apply, idempotency and rollback", () => {
  it("a second run is an empty plan and writes nothing", async () => {
    const p = await make("server-actions");
    const d = await approved(p);
    const first = await applyPlan(p.fs, await p.plan(d));
    expect(first.status).toBe("applied");
    const again = await p.plan(d);
    expect(isEmptyPlan(again)).toBe(true);
    const { fs, log } = spyFs(p.fs);
    expect((await applyPlan(fs, again)).status).toBe("noop");
    expect(log).toEqual([]);
  });
  it("detects a hand-edited generated file and never overwrites it", async () => {
    const p = await make("server-actions");
    const d = await approved(p);
    await applyPlan(p.fs, await p.plan(d));
    const edited = `${await p.read(".speeq/generated/tools.ts")}// mine\n`;
    await p.write(".speeq/generated/tools.ts", edited);
    const plan = await p.plan(await approved(p, [ADD]));
    expect(plan.conflicts).toEqual([".speeq/generated/tools.ts"]);
    expect((await applyPlan(p.fs, plan)).status).toBe("conflict");
    expect(await p.read(".speeq/generated/tools.ts")).toBe(edited);
  });
  it("leaves a file alone once the developer removes the marker", async () => {
    const p = await make("server-actions");
    const d = await approved(p);
    await applyPlan(p.fs, await p.plan(d));
    const mine = "export const tools = [];\n";
    await p.write(".speeq/generated/tools.ts", mine);
    const plan = await p.plan(d);
    expect(plan.conflicts).toEqual([]);
    expect(plan.changes.find((c) => c.path.endsWith("tools.ts"))).toMatchObject({
      action: "keep",
      ownership: "foreign",
    });
    await applyPlan(p.fs, plan);
    expect(await p.read(".speeq/generated/tools.ts")).toBe(mine);
  });
  it("keeps decisions across a rescan and removes a wrapper whose fingerprint changed", async () => {
    const p = await make("server-actions");
    let d = await approved(p, [ADD]);
    await applyPlan(p.fs, await p.plan(d));
    await writeDecisions(p.fs, "", d as DecisionsFile);
    d = await readDecisions(p.fs, "");
    expect(d?.capabilities[ADD]?.review).toBe("approved");
    await p.scan();
    expect((await p.plan(d)).wrapped.map((w) => w.id)).toEqual([ADD]);
    const src = await p.read("app/actions.ts");
    await p.write("app/actions.ts", src.replace(/z\.string\(\)/, "z.string().min(3)"));
    await p.scan();
    const plan = await p.plan(d);
    expect(plan.stale).toContain(ADD);
    expect(plan.wrapped.map((w) => w.id)).not.toContain(ADD);
    await applyPlan(p.fs, plan);
    expect(await p.read(".speeq/generated/tools.ts")).not.toContain("addItem");
    expect((await readDecisions(p.fs, ""))?.capabilities[ADD]?.approvedFingerprint).toBe(
      d?.capabilities[ADD]?.approvedFingerprint,
    );
  });
  it("does not wrap a disabled capability", async () => {
    const p = await make("server-actions");
    const m = p.manifest ?? (await p.scan());
    const d = setDecision(await approved(p, [ADD, TAGGED]), m, TAGGED, "disable");
    expect((await p.plan(d)).wrapped.map((w) => w.id)).toEqual([ADD]);
  });
  it("rollback restores the pre-init tree", async () => {
    const p = await make("server-actions");
    const before = await snapshot(p.dir);
    const result = await applyPlan(p.fs, await p.plan(await approved(p)));
    expect(result.status).toBe("applied");
    expect(await snapshot(p.dir)).not.toEqual(before);
    const r = await rollback(p.fs, "");
    expect(r.status).toBe("done");
    expect(await snapshot(p.dir)).toEqual(before);
    expect((await rollback(p.fs, "")).status).toBe("none");
  });
  it("rollback restores updated files and skips ones changed since", async () => {
    const p = await make("server-actions");
    const d1 = await approved(p, [ADD]);
    await applyPlan(p.fs, await p.plan(d1), { now: () => new Date("2026-01-01T00:00:00Z") });
    const afterFirst = await snapshot(p.dir);
    await applyPlan(p.fs, await p.plan(await approved(p, [ADD, TAGGED])), {
      now: () => new Date("2026-01-02T00:00:00Z"),
    });
    const second = await p.read(".speeq/generated/tools.ts");
    expect(second).not.toBe(afterFirst[".speeq/generated/tools.ts"]);
    expect((await rollback(p.fs, "")).status).toBe("done");
    expect(await p.read(".speeq/generated/tools.ts")).toBe(afterFirst[".speeq/generated/tools.ts"]);
    // a hand edit after apply is never reverted
    await applyPlan(p.fs, await p.plan(await approved(p, [ADD, TAGGED])), {
      now: () => new Date("2026-01-03T00:00:00Z"),
    });
    await p.write(".speeq/generated/tools.ts", "// my own\n");
    const partial = await rollback(p.fs, "");
    expect(partial.status).toBe("partial");
    expect(await p.read(".speeq/generated/tools.ts")).toBe("// my own\n");
    expect(partial.status === "partial" && partial.skipped.map((s) => s.path)).toEqual([
      ".speeq/generated/tools.ts",
    ]);
  });
  it("restores the tree when a write fails part-way", async () => {
    const p = await make("server-actions");
    const before = await snapshot(p.dir);
    const { fs } = spyFs(p.fs, 4);
    const r = await applyPlan(fs, await p.plan(await approved(p)));
    expect(r).toMatchObject({ status: "failed", restored: true });
    expect(await snapshot(p.dir)).toEqual(before);
  });
  it("refuses to write generated source that does not parse", async () => {
    const p = await make("server-actions");
    const plan = await p.plan(await approved(p));
    const bad = plan.changes.find((c) => c.path.endsWith("routes.ts"));
    if (bad) bad.content = "export const = ;";
    const before = await snapshot(p.dir);
    expect((await applyPlan(p.fs, plan)).status).toBe("failed");
    expect(await snapshot(p.dir)).toEqual(before);
  });
});

describe("host files", () => {
  it("never overwrites an existing config and prints a snippet instead", async () => {
    const p = await make("server-actions");
    await p.write("speeq.config.ts", "export const speeq = {};\n");
    const plan = await p.plan(await approved(p));
    expect(plan.changes.find((c) => c.path === "speeq.config.ts")).toMatchObject({
      action: "keep",
    });
    expect(plan.manual.some((m) => m.title.includes("speeq.config.ts"))).toBe(true);
    await applyPlan(p.fs, plan);
    expect(await p.read("speeq.config.ts")).toBe("export const speeq = {};\n");
  });
  it("never edits the root layout: it prints the snippet, and stops asking once present", async () => {
    const p = await make("server-actions");
    const layout = await p.read("app/layout.tsx").catch(() => undefined);
    const plan = await p.plan(await approved(p));
    await applyPlan(p.fs, plan);
    expect(await p.read("app/layout.tsx").catch(() => undefined)).toBe(layout);
    await p.write(
      "app/layout.tsx",
      "import { SpeeqProvider } from 'speeq/react';\nexport default function L(){return null}\n",
    );
    expect((await p.plan(await approved(p))).manual.map((m) => m.title)).not.toContain(
      "Add the provider to your root layout",
    );
  });
  it("places the handler under src/app for a src layout", async () => {
    const p = await make("next-app-src");
    const plan = await p.plan(p.approve(undefined, "route:/"));
    expect(plan.changes.map((c) => c.path)).toContain("src/app/api/speeq/[[...speeq]]/route.ts");
  });
  it("only prints guidance for the Pages Router", async () => {
    const p = await make("next-pages-minimal");
    const plan = await p.plan(p.approve(undefined, "route:/"));
    expect(plan.changes.some((c) => c.path.includes("route.ts"))).toBe(false);
    expect(plan.manual.map((m) => m.title)).toContain("Mount the speeq handler");
  });
});

describe("decisions", () => {
  it("serializes stably and records the current fingerprint", async () => {
    const p = await make("server-actions");
    const m = p.manifest ?? (await p.scan());
    const d = setDecision(undefined, m, TAGGED, "enable");
    expect(d.capabilities[TAGGED]?.approvedFingerprint).toBe(
      m.capabilities.find((c) => c.id === TAGGED)?.fingerprint,
    );
    expect(serializeDecisions(d)).toBe(serializeDecisions(structuredClone(d)));
    await writeDecisions(p.fs, "", d);
    await p.write(".speeq/decisions.json", "{ not json");
    await expect(readDecisions(p.fs, "")).rejects.toThrow(IntegrateError);
  });
});

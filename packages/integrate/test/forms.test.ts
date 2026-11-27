import { formFillActionName } from "@speeq/core";
import type { DecisionsFile, Manifest } from "@speeq/core/manifest";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPlan,
  isEmptyPlan,
  ownership,
  setDecision,
  verifyProject,
  writeDecisions,
} from "../src/index.js";
import { project } from "./helpers.js";

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
const CONTACT = "form:app/contact/page.tsx#contact";
const LOGIN = "form:app/login/page.tsx#form1";
const PAY = "form:app/pay/page.tsx#form1";
const DEPS = { dependencies: { next: "15", zod: "4", speeq: "0.4.0" } };
const DYNAMIC = "form:app/dynamic/page.tsx#form1";
const approve = (p: P, ids: string[]) => {
  let d: DecisionsFile | undefined;
  for (const id of ids) d = p.approve(d, id);
  return d as DecisionsFile;
};
const uiOf = (plan: Awaited<ReturnType<P["plan"]>>) =>
  plan.changes.find((c) => c.path === ".speeq/generated/ui.ts");
const verify = (p: P, d?: DecisionsFile) =>
  verifyProject({
    fs: p.fs,
    manifest: p.manifest as Manifest,
    options: p.options,
    levels: ["static", "runtime"],
    env: { SPEEQ_SECRET: "x" },
  });

describe("form fill generation", () => {
  it("generates no ui.ts when no form is approved", async () => {
    const p = await make("forms");
    const plan = await p.plan(undefined);
    expect(uiOf(plan)).toBeUndefined();
    expect(plan.forms).toEqual([]);
  });

  it("generates draft-fill descriptors for an approved form and tells the user how to bind it", async () => {
    const p = await make("forms");
    const plan = await p.plan(approve(p, [CONTACT]));
    const ui = uiOf(plan);
    expect(ui?.action).toBe("create");
    expect(ui?.content).toContain("defineFormFill");
    expect(ui?.content).toContain('"form:app/contact/page.tsx#contact"');
    expect(plan.wrapped).toContainEqual({ id: CONTACT, tool: formFillActionName(CONTACT) });
    expect(
      plan.manual.some((m) => m.title.includes(CONTACT) && m.snippet.includes("useSpeeqForm")),
    ).toBe(true);
    const config = plan.changes.find((c) => c.path === "speeq.config.ts")?.content ?? "";
    expect(config).toContain("uiActions,");
    expect(config).toContain("generated/ui");
    expect(config).not.toContain("uiActions: []");
  });

  it("needs no auth decision: a draft only changes page state", async () => {
    const p = await make("forms");
    const d = setDecision(undefined, p.manifest as Manifest, CONTACT, "enable", {});
    expect((await p.plan(d)).forms.map((f) => f.id)).toEqual([CONTACT]);
  });

  it("is idempotent and rollback-safe like the other generated files", async () => {
    const p = await make("forms");
    const d = approve(p, [CONTACT]);
    expect((await applyPlan(p.fs, await p.plan(d))).status).toBe("applied");
    expect(isEmptyPlan(await p.plan(d))).toBe(true);
    expect(ownership(await p.read(".speeq/generated/ui.ts"))).toBe("owned");
  });

  it("skips a form that is not approved and refuses to approve credential forms at all", async () => {
    const p = await make("forms");
    const plan = await p.plan(approve(p, [DYNAMIC]));
    expect(plan.forms).toEqual([]);
    expect(uiOf(plan)).toBeUndefined();
    expect(() => approve(p, [LOGIN])).toThrow(/can never be enabled/);
    expect(() => approve(p, [PAY])).toThrow(/can never be enabled/);
  });

  it("goes stale and is removed when the form changes after approval", async () => {
    const p = await make("forms");
    const d = approve(p, [CONTACT]);
    await applyPlan(p.fs, await p.plan(d));
    const page = await p.read("app/contact/page.tsx");
    await p.write("app/contact/page.tsx", page.replace('name="body"', 'name="message"'));
    await p.scan();
    const plan = await p.plan(d);
    expect(plan.forms).toEqual([]);
    expect(plan.stale).toContain(CONTACT);
    expect(uiOf(plan)?.action).toBe("update");
    expect(uiOf(plan)?.content).not.toContain("defineFormFill({");
  });

  it("asks for a manual config change when the config already exists without uiActions", async () => {
    const p = await make("forms");
    await p.write("speeq.config.ts", "export const speeq = {};\n");
    const plan = await p.plan(approve(p, [CONTACT]));
    expect(plan.manual.some((m) => m.title.startsWith("Pass the generated UI actions"))).toBe(true);
  });
});

describe("form fill verification", () => {
  it("passes static S4 and runtime R8 on a clean integration", async () => {
    const p = await make("forms");
    const d = approve(p, [CONTACT]);
    await writeDecisions(p.fs, p.options.prefix, d);
    await applyPlan(p.fs, await p.plan(d));
    await p.write("package.json", JSON.stringify(DEPS));
    const ok = await verify(p, d);
    expect(ok.checks.find((c) => c.id === "R8")?.status).toBe("pass");
    expect(ok.checks.find((c) => c.id === "S4")?.status).toBe("pass");
  });

  it("flags a stale ui.ts in S4", async () => {
    const p = await make("forms");
    const d = approve(p, [CONTACT]);
    await writeDecisions(p.fs, p.options.prefix, d);
    await applyPlan(p.fs, await p.plan(d));
    await p.write("package.json", JSON.stringify(DEPS));
    const page = await p.read("app/contact/page.tsx");
    await p.write(
      "app/contact/page.tsx",
      page.replace("<textarea", '<input name="extra" /><textarea'),
    );
    await p.scan();
    const report = await verify(p, d);
    expect(report.checks.find((c) => c.id === "S4")?.status).toBe("fail");
  });
});

describe("filters", () => {
  const FILTERS = "filter-set:/practice";
  const ROUTE = "route:/practice";
  it("reports an approved filter-set as applied through its approved route", async () => {
    const p = await make("filters");
    const plan = await p.plan(approve(p, [ROUTE, FILTERS]));
    const route = plan.wrapped.find((w) => w.id === ROUTE);
    expect(route).toBeTruthy();
    expect(plan.wrapped).toContainEqual({ id: FILTERS, tool: route?.tool });
    expect(plan.changes.find((c) => c.path.endsWith("routes.ts"))?.content).toContain("practice");
  });

  it("skips a filter-set whose route is not approved, with the reason", async () => {
    const p = await make("filters");
    const plan = await p.plan(approve(p, [FILTERS]));
    expect(plan.skipped.find((s) => s.id === FILTERS)?.reason).toContain("Approve route:/practice");
  });
});

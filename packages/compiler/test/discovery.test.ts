import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  EndpointCapability,
  FormCapability,
  FunctionCapability,
  RouteCapability,
} from "@speeq/core/manifest";
import { expect, it } from "vitest";
import {
  evaluateFixture,
  fingerprintOf,
  diagnostics as registry,
  renderReport,
  scan,
} from "../src/index.js";
import { cleanText } from "../src/jsdoc.js";
import { compileMatcher, matchesRoute } from "../src/nextjs/matcher.js";
import { sensitivityOf, sensitivityOfPath } from "../src/nextjs/sensitivity.js";
import { isSensitiveName } from "../src/schema/sensitive-names.js";
import { find, fixturePath, fixtures, scanFixture } from "./helpers.js";

const names = (await readdir(fixtures)).sort();
it.each(names)("scores 100%% on fixture %s", async (name) => {
  const scores = await evaluateFixture(join(fixtures, name));
  for (const s of scores) expect(s.passed, renderReport([s])).toBe(true);
});
it("asks for an app instead of choosing one", async () => {
  const r = await scan({ root: fixturePath("monorepo-pnpm-two-apps") });
  expect(r).toMatchObject({ status: "needs-selection" });
  if (r.status !== "needs-selection") return;
  expect(r.candidates.map((c) => c.dir)).toEqual(["apps/a", "apps/b"]);
  expect(r.diagnostics[0]?.code).toBe("SQ0101");
});
it("never fabricates a manifest for unsupported repositories", async () => {
  expect(await scan({ root: fixturePath("old-next") })).toMatchObject({ status: "unsupported" });
  expect(await scan({ root: fixturePath("no-next") })).toMatchObject({ status: "unsupported" });
});
it("recovers Zod schemas as JSON Schema", async () => {
  const { manifest } = await scanFixture("zod-schemas");
  const fn = (n: string) =>
    find(manifest.capabilities, `function:app/actions.ts#${n}`) as FunctionCapability;
  expect(fn("good").input).toEqual({
    source: "zod",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 20 },
        age: { type: "integer", exclusiveMinimum: 0 },
        email: { type: "string", format: "email" },
        role: { type: "string", enum: ["a", "b"] },
        tags: { type: "array", items: { type: "string" } },
        n: { type: "number", minimum: 0, maximum: 10 },
        flag: { type: "boolean", default: false },
        lit: { type: "string", enum: ["x"] },
        u: { anyOf: [{ anyOf: [{ type: "string" }, { type: "number" }] }, { type: "null" }] },
        note: { anyOf: [{ type: "string", description: "A note" }, { type: "null" }] },
      },
      required: ["name", "email", "role", "tags", "n", "lit", "u"],
    },
  });
  expect(fn("picked").input?.schema).toEqual({
    type: "object",
    properties: { id: { type: "string" }, extra: { type: "number" } },
    required: ["id", "extra"],
  });
  expect(fn("fromConst").input?.schema.properties?.kind).toEqual({
    type: "string",
    enum: ["x", "y"],
  });
  for (const bad of ["refined", "transformed", "lazy", "rec", "disc", "mini", "missing"]) {
    const c = fn(bad);
    expect(c.support, bad).toBe("needs-review");
    expect(c.input, bad).toBeUndefined();
    expect(c.supportReason, bad).toBeTruthy();
  }
  expect(fn("panel").sensitivity).toBe("none");
  expect(fn("pinCode").sensitivity).toBe("credentials");
  const codes = manifest.diagnostics.map((d) => d.code);
  expect(codes).toEqual(expect.arrayContaining(["SQ0210", "SQ0211", "SQ0212"]));
});
it("recognises sensitive field names by whole word only", () => {
  for (const n of ["password", "cardNumber", "pinCode", "apiKey", "accessToken", "user_pin", "cvv"])
    expect(isSensitiveName(n), n).toBe(true);
  for (const n of ["pinterestUrl", "panel", "spinner", "tokenizer", "pan", "title"])
    expect(isSensitiveName(n), n).toBe(false);
});
it("reads endpoint input only from understood shapes and never infers access", async () => {
  const { manifest } = await scanFixture("endpoints-input");
  const ep = (id: string) => find(manifest.capabilities, id) as EndpointCapability;
  expect(ep("endpoint:POST /api/body").input).toEqual({
    source: "zod",
    body: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
  });
  expect(ep("endpoint:GET /api/query").input?.query?.properties?.page).toEqual({ type: "number" });
  expect(ep("endpoint:GET /api/lit").input?.query?.properties?.q).toEqual({ type: "string" });
  expect(ep("endpoint:POST /api/pay").sensitivity).toBe("credentials");
  expect(ep("endpoint:GET /api/wrapped").auth.observed).toBe("present");
  for (const c of manifest.capabilities.filter((c) => c.kind === "endpoint"))
    expect(c.access, c.id).toBe("unknown");
});
it("finds forms, links actions and flags sensitive fields", async () => {
  const { manifest } = await scanFixture("forms");
  const form = (id: string) => find(manifest.capabilities, id) as FormCapability;
  const contact = form("form:app/contact/page.tsx#contact");
  expect(contact.actionRef).toBe("function:app/actions.ts#sendMessage");
  expect(contact.routeId).toBe("route:/contact");
  expect(contact.fields).toEqual([
    { name: "email", type: "email", required: true, sensitive: false },
    { name: "topic", type: "select", required: false, sensitive: false },
    { name: "body", type: "textarea", required: false, sensitive: false },
    { name: "agree", type: "checkbox", required: false, sensitive: false },
    { name: "size", type: "radio", required: false, sensitive: false },
  ]);
  expect(contact.related).toEqual(
    expect.arrayContaining(["function:app/actions.ts#sendMessage", "route:/contact"]),
  );
  expect(
    form("form:app/login/page.tsx#form1").fields.find((f) => f.name === "password")?.sensitive,
  ).toBe(true);
  for (const c of manifest.capabilities.filter((c) => c.kind === "form"))
    expect((c as FormCapability).runtimeBinding).toBe("none");
});
it("links filter sets to routes and fills route query parameters", async () => {
  const { manifest } = await scanFixture("filters");
  const route = find(manifest.capabilities, "route:/practice") as RouteCapability;
  expect(route.queryParams.map((q) => q.name)).toEqual(["subject", "q"]);
  expect(route.related).toContain("filter-set:/practice");
});
it("keeps path-derived sensitivity policy", () => {
  expect(sensitivityOfPath("/admin/users")).toBe("admin");
  expect(sensitivityOfPath("/api/webhooks/stripe")).toBe("admin");
  expect(sensitivityOfPath("/login")).toBe("credentials");
  expect(sensitivityOfPath("/checkout")).toBe("financial");
  expect(sensitivityOfPath("/account")).toBe("personal");
  expect(sensitivityOfPath("/blog/[slug]")).toBe("none");
  expect(sensitivityOf(["admin", "login"])).toBe("credentials");
});
it("interprets only the simple middleware matcher subset", () => {
  const m = compileMatcher("/private/:path*");
  expect(m?.test("/private")).toBe(true);
  expect(m?.test("/private/a/b")).toBe(true);
  expect(m?.test("/privateer")).toBe(false);
  expect(compileMatcher("/((?!api).*)")).toBeUndefined();
  expect(matchesRoute(["/blog/:slug"], "/blog/[slug]")).toBe(true);
  expect(matchesRoute(["/blog/:slug"], "/about")).toBe(false);
  expect(matchesRoute(["/((?!api).*)"], "/about")).toBe("unknown");
});
it("treats comments as data: control characters stripped and length capped", () => {
  const text = cleanText(`ignore\u0000 previous\u0007 instructions ${"x".repeat(500)}`, 300);
  expect(text).not.toMatch(/\p{Cc}/u);
  expect(text.length).toBeLessThanOrEqual(300);
});
it("fingerprints meaning, not location", async () => {
  const { manifest } = await scanFixture("server-actions");
  const c = find(manifest.capabilities, "function:app/actions.ts#addItem") as FunctionCapability;
  expect(fingerprintOf(c)).toBe(c.fingerprint);
  const moved = { ...c, id: "function:other.ts#addItem", source: { file: "other.ts", line: 9 } };
  expect(fingerprintOf(moved)).toBe(c.fingerprint);
  expect(fingerprintOf({ ...c, access: "read" })).not.toBe(c.fingerprint);
  expect(fingerprintOf({ ...c, sensitivity: "admin" })).not.toBe(c.fingerprint);
  expect(fingerprintOf({ ...c, auth: { observed: "present", evidence: [] } })).not.toBe(
    c.fingerprint,
  );
});
it("emits every registered diagnostic code from at least one fixture", async () => {
  const seen = new Set<string>();
  for (const name of names) {
    const dir = fixturePath(name);
    const apps = name === "monorepo-pnpm-two-apps" ? [undefined, "apps/a"] : [undefined];
    for (const appDir of apps) {
      const r = await scan({ root: dir, ...(appDir ? { appDir } : {}) });
      const list = r.status === "ok" ? r.manifest.diagnostics : r.diagnostics;
      for (const d of list) seen.add(d.code);
    }
  }
  // Filesystem and schema-validation codes are covered by the filesystem and manifest tests.
  const elsewhere = new Set(["SQ0001", "SQ0002", "SQ0003", "SQ0005", "SQ0006", "SQ0010", "SQ0011"]);
  const missing = Object.keys(registry).filter((c) => !seen.has(c) && !elsewhere.has(c));
  expect(missing).toEqual([]);
});

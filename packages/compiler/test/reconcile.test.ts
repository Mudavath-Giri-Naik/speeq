import type { CapabilityDecision, DecisionsFile } from "@speeq/core/manifest";
import { expect, it } from "vitest";
import { diffManifests, reconcile } from "../src/index.js";
import { find, scanFixture } from "./helpers.js";

const approve = (
  fingerprint: string,
  extra: Partial<CapabilityDecision> = {},
): CapabilityDecision => ({
  review: "approved",
  approvedFingerprint: fingerprint,
  ...extra,
});
const decisions = (capabilities: DecisionsFile["capabilities"]): DecisionsFile => ({
  decisionsVersion: 1,
  capabilities,
});
const bound = () => ({ binding: "bound" as const, verification: "unverified" as const });

it("never approves on the developer's behalf", async () => {
  const { manifest } = await scanFixture("forms");
  const r = reconcile(manifest, undefined);
  expect(r.newCapabilities).toHaveLength(manifest.capabilities.length);
  expect(r.entries.every((e) => !e.status.executable && e.status.review === "pending")).toBe(true);
});
it("reports current, stale, disabled and blocked decisions", async () => {
  const { manifest } = await scanFixture("forms");
  const route = find(manifest.capabilities, "route:/contact");
  const login = find(manifest.capabilities, "route:/login");
  const two = find(manifest.capabilities, "route:/two");
  const r = reconcile(
    manifest,
    decisions({
      [route.id]: approve(route.fingerprint),
      [login.id]: approve(login.fingerprint),
      [two.id]: approve("0".repeat(64)),
      "route:/dynamic": { review: "disabled" },
    }),
    bound,
  );
  const status = (id: string) => r.entries.find((e) => e.id === id)?.status;
  expect(status(route.id)).toMatchObject({ executable: true, headline: "executable" });
  expect(status(login.id)).toMatchObject({ executable: false, headline: "blocked" });
  expect(status(two.id)).toMatchObject({
    executable: false,
    freshness: "stale",
    headline: "stale",
  });
  expect(status("route:/dynamic")).toMatchObject({ review: "disabled", headline: "disabled" });
  expect(r.stale).toEqual([two.id]);
});
it("requires a developer-set access level when the compiler could not prove one", async () => {
  const { manifest } = await scanFixture("server-actions");
  const fn = find(manifest.capabilities, "function:app/actions.ts#parsed");
  expect(fn.access).toBe("unknown");
  const without = reconcile(manifest, decisions({ [fn.id]: approve(fn.fingerprint) }), bound);
  expect(without.entries.find((e) => e.id === fn.id)?.status.executable).toBe(false);
  expect(without.invalidDecisions.map((d) => d.id)).toEqual([fn.id]);
  const withAccess = reconcile(
    manifest,
    decisions({ [fn.id]: approve(fn.fingerprint, { access: "read" }) }),
    bound,
  );
  expect(withAccess.entries.find((e) => e.id === fn.id)?.status.executable).toBe(true);
  expect(withAccess.invalidDecisions).toEqual([]);
});
it("keeps admin capabilities blocked unless the developer allows sensitivity", async () => {
  const { manifest } = await scanFixture("sensitive-routes");
  const admin = find(manifest.capabilities, "route:/admin/users");
  const blocked = reconcile(manifest, decisions({ [admin.id]: approve(admin.fingerprint) }), bound);
  expect(blocked.entries.find((e) => e.id === admin.id)?.status.executable).toBe(false);
  const allowed = reconcile(
    manifest,
    decisions({ [admin.id]: approve(admin.fingerprint, { allowSensitive: true }) }),
    bound,
  );
  expect(allowed.entries.find((e) => e.id === admin.id)?.status.executable).toBe(true);
  const login = find(manifest.capabilities, "route:/login");
  const never = reconcile(
    manifest,
    decisions({ [login.id]: approve(login.fingerprint, { allowSensitive: true }) }),
    bound,
  );
  expect(never.entries.find((e) => e.id === login.id)?.status.executable).toBe(false);
});
it("detects a moved function only when the match is unique", async () => {
  const { manifest } = await scanFixture("server-actions");
  const fn = find(manifest.capabilities, "function:app/actions.ts#addItem");
  const old = "function:old/actions.ts#addItem";
  const one = reconcile(manifest, decisions({ [old]: approve(fn.fingerprint) }));
  expect(one.moved).toEqual([{ from: old, to: fn.id }]);
  expect(one.orphaned).toEqual([]);
  const two = reconcile(
    manifest,
    decisions({
      [old]: approve(fn.fingerprint),
      "function:older/actions.ts#addItem": approve(fn.fingerprint),
    }),
  );
  expect(two.moved).toEqual([]);
  expect(two.orphaned).toHaveLength(2);
  const route = reconcile(manifest, decisions({ "route:/gone": approve("a".repeat(64)) }));
  expect(route.moved).toEqual([]);
  expect(route.orphaned).toEqual(["route:/gone"]);
});
it("diffs manifests by id and fingerprint", async () => {
  const a = (await scanFixture("forms")).manifest;
  const b = (await scanFixture("filters")).manifest;
  expect(diffManifests(undefined, a).added).toHaveLength(a.capabilities.length);
  const same = diffManifests(a, a);
  expect(same).toMatchObject({
    added: [],
    removed: [],
    changed: [],
    unchanged: a.capabilities.length,
  });
  const other = diffManifests(a, b);
  expect(other.removed).toContain("route:/contact");
  expect(other.added).toContain("route:/practice");
  const changed = structuredClone(a);
  const first = changed.capabilities[0];
  if (first) first.fingerprint = "f".repeat(64);
  expect(diffManifests(a, changed).changed).toEqual([first?.id]);
});

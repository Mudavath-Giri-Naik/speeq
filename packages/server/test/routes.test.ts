import { describe, expect, it } from "vitest";
import { z } from "zod";
import { resolveNavigation } from "../src/agent/routes.js";
import { defineRoute, type RouteDefinition } from "../src/index.js";

const routes = new Map<string, RouteDefinition>(
  [
    defineRoute({ id: "pricing", path: "/pricing", title: "Pricing" }),
    defineRoute({
      id: "subject",
      path: "/subjects/:slug",
      title: "Subject",
      params: z.object({ slug: z.string().min(1), tab: z.string().optional() }),
    }),
  ].map((r) => [r.id, r]),
);

describe("route manifest", () => {
  it("builds hrefs, encodes path params and moves extras to the query", () => {
    expect(resolveNavigation(routes, "pricing", undefined).href).toBe("/pricing");
    expect(resolveNavigation(routes, "subject", { slug: "a b/c", tab: "topics" }).href).toBe(
      "/subjects/a%20b%2Fc?tab=topics",
    );
  });

  it("rejects routes that are not in the manifest", () => {
    expect(() => resolveNavigation(routes, "admin", {})).toThrow(/Unknown route/);
    expect(() => resolveNavigation(routes, "https://evil.example", {})).toThrow(/Unknown route/);
  });

  it("validates params against the route schema", () => {
    expect(() => resolveNavigation(routes, "subject", {})).toThrow(/Invalid params/);
    expect(() => resolveNavigation(routes, "pricing", { x: 1 })).toThrow(/takes no params/);
  });

  it("drops unknown params instead of passing them through", () => {
    expect(resolveNavigation(routes, "subject", { slug: "x", redirect: "//evil" }).href).toBe(
      "/subjects/x",
    );
  });
});

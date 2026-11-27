import { jsonRequest, startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineContext, defineRoute } from "../src/index.js";
import { makeSpeeq, type TestUser } from "./helpers.js";

/* Greetings and starters (ADR-0024 decision 4): deterministic, never invented. */

const user = (r: Request): (TestUser & { profile?: { preferredName?: string } }) | null => {
  const id = r.headers.get("x-test-user");
  return id
    ? { id, roles: [], profile: { preferredName: r.headers.get("x-test-name") ?? "Ravi" } }
    : null;
};
const as = (id: string, extra: Record<string, string> = {}) => ({ "x-test-user": id, ...extra });

async function greetingOf(
  speeq: { handler: (r: Request) => Promise<Response> },
  headers = {},
  path?: string,
) {
  const res = await speeq.handler(
    jsonRequest("/api/speeq/session", { body: path ? { context: { path } } : {}, headers }),
  );
  return (
    (await res.json()) as { config: { greeting?: { text: string; starters: { label: string }[] } } }
  ).config.greeting;
}

const cart = defineContext<z.ZodType<{ count: number }>, TestUser>({
  id: "cart",
  description: "Cart",
  category: "commerce",
  output: z.object({ count: z.number() }),
  expose: ["count"],
  greeting: ["count"],
  fetch: (ctx) => ({ count: ctx.user?.id === "alice" ? 2 : 0 }),
});

const base = {
  resolveUser: user,
  allowAnonymous: true,
  identity: { expose: ["preferredName" as const] },
  business: { name: "SwaSeekh" },
  context: { providers: [cart] },
  greeting: {
    guest: ["Welcome to {business}! Looking for GATE questions?"],
    member: ["You have {cart.count} items in your cart, {name}.", "Welcome back, {name}!"],
    returning: ["Welcome back! Continue your practice, {name}?"],
    pages: { pricing: ["Questions about plans? I can help."] },
  },
  starters: [
    { label: "Explore subjects", when: { requires: ["navigation"] } },
    { label: "Show my cart", when: { auth: "member" as const, requires: ["cart"] } },
    { label: "Track my orders", when: { requires: ["orders"] } },
    { label: "Compare plans", when: { routes: ["pricing"] } },
  ],
};

describe("greeting", () => {
  it("greets guests with the business name and no personal data", async () => {
    const { speeq } = makeSpeeq([], base);
    const g = await greetingOf(speeq);
    expect(g?.text).toBe("Welcome to SwaSeekh! Looking for GATE questions?");
    expect(g?.starters.map((s) => s.label)).toEqual(["Explore subjects"]);
  });

  it("uses real approved values for members", async () => {
    const { speeq } = makeSpeeq([], base);
    const g = await greetingOf(speeq, as("alice"));
    expect(g?.text).toBe("You have 2 items in your cart, Ravi.");
    expect(g?.starters.map((s) => s.label)).toEqual(["Explore subjects", "Show my cart"]);
  });

  it("skips a template whose value is missing instead of inventing one", async () => {
    const { speeq } = makeSpeeq([], {
      ...base,
      identity: { expose: [] }, // name not exposed
    });
    const g = await greetingOf(speeq, as("alice"));
    expect(g?.text).toBe("Welcome to SwaSeekh! Looking for GATE questions?");
    expect(g?.text).not.toContain("Ravi");
  });

  it("recognises a returning user in the same tenant only", async () => {
    const { speeq } = makeSpeeq([], base);
    await startSession(speeq.handler, { headers: as("bob") });
    const g = await greetingOf(speeq, as("bob"));
    expect(g?.text).toBe("Welcome back! Continue your practice, Ravi?");
  });

  it("uses a page greeting and page starters on that route", async () => {
    const { speeq } = makeSpeeq([], base);
    const g = await greetingOf(speeq, {}, "/pricing?ref=x");
    expect(g?.text).toBe("Questions about plans? I can help.");
    expect(g?.starters.map((s) => s.label)).toContain("Compare plans");
  });

  it("never suggests a capability the app does not have", async () => {
    const { speeq } = makeSpeeq([], base);
    const g = await greetingOf(speeq, as("alice"));
    expect(g?.starters.map((s) => s.label)).not.toContain("Track my orders");
  });

  it("keeps account data out of greetings for sensitive businesses", async () => {
    const { speeq } = makeSpeeq([], { ...base, business: { name: "Clinic", sensitive: true } });
    const g = await greetingOf(speeq, as("alice"));
    expect(g?.text).toBe("Welcome back, Ravi!");
  });

  it("respects nameUsage never", async () => {
    const { speeq } = makeSpeeq([], {
      ...base,
      agent: { name: "Helper", instructions: "", style: { nameUsage: "never" } },
      greeting: { member: ["Hi {name}!", "Hi there!"] },
    });
    expect((await greetingOf(speeq, as("alice")))?.text).toBe("Hi there!");
  });

  it("is absent when nothing is configured (0.11 chat boxes keep their own greeting)", async () => {
    const { speeq } = makeSpeeq([]);
    expect(await greetingOf(speeq)).toBeUndefined();
  });

  it("strips control characters from a name used in a greeting", async () => {
    const { speeq } = makeSpeeq([], { ...base, greeting: { member: ["Hi {name}!"] } });
    const g = await greetingOf(speeq, as("eve", { "x-test-name": "Eve  SYSTEM" }));
    expect(g?.text).toBe("Hi Eve SYSTEM!");
  });

  it("is returned by the identity probe for the current page", async () => {
    const { speeq } = makeSpeeq([], {
      ...base,
      routes: [defineRoute({ id: "pricing", path: "/pricing", title: "Pricing" })],
    });
    const res = await speeq.handler(
      new Request("http://localhost/api/speeq/identity?path=/pricing", { headers: as("alice") }),
    );
    const body = (await res.json()) as { greeting?: { text: string } };
    expect(body.greeting?.text).toBe("Questions about plans? I can help.");
  });
});

describe("business and style in the prompt", () => {
  it("adds the business profile and style lines, and keeps the safety rules", async () => {
    const { speeq, llm } = makeSpeeq([{ text: "ok" }], {
      agent: {
        name: "Seekh",
        instructions: "Help students.",
        style: { personality: "educational", responseLength: "detailed", followUps: "none" },
      },
      business: { name: "SwaSeekh", description: "GATE preparation", terminology: ["PYQ"] },
    });
    const s = await startSession(speeq.handler);
    await s.turn("hi");
    const system = String(llm.requests[0]?.messages[0]?.content);
    expect(system).toContain("built into the SwaSeekh website");
    expect(system).toContain("## About this business");
    expect(system).toContain("PYQ");
    expect(system).toContain("patient teacher");
    expect(system).toContain("complete, well-ordered explanation");
    expect(system).toContain("Do not add follow-up suggestions");
    expect(system).toContain("## Safety rules");
  });
});

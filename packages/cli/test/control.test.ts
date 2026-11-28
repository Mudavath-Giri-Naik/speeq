import { afterEach, describe, expect, it } from "vitest";
import { app, scripted } from "./helpers.js";

/* The terminal control center (ADR-0024, task 027). */

const CONFIG = `// Created by \`speeq init\`. This file is yours: speeq never overwrites it.
import { createSpeeq } from "speeq/server";
import { createMemoryStore } from "speeq/store-memory";
import { createMockLLMProvider } from "speeq/testing";

const memory = globalThis as { __speeqStore?: ReturnType<typeof createMemoryStore> };
const store = (memory.__speeqStore ??= createMemoryStore());

export const speeq = createSpeeq({
  secret: process.env.SPEEQ_SECRET,
  agent: { name: "Assistant", instructions: "You help people use this website.", languages: ["en-IN"] },
  llm: createMockLLMProvider({}),
  // In-memory store: conversations are lost when the server restarts. Use speeq/store-mongodb for production.
  store,
  // resolveUser: async (request) => null,
});
`;
const SETUP = JSON.stringify({
  setupVersion: 1,
  provider: "mock",
  voice: "none",
  languages: ["en-IN"],
  ui: false,
  env: true,
});
const URI = "mongodb+srv://ravi:S3cretPass@cluster0.example.net/shop";

const made: Awaited<ReturnType<typeof app>>[] = [];
afterEach(async () => {
  for (const a of made.splice(0)) await a.cleanup();
});

async function shop() {
  const a = await app("next-app-minimal");
  made.push(a);
  await a.write(
    "package.json",
    JSON.stringify({
      name: "kirana-mart",
      dependencies: { next: "^16.0.0", "next-auth": "^5.0.0-beta.25" },
    }),
  );
  await a.write(".gitignore", "node_modules\n");
  await a.write(".speeq/setup.json", SETUP);
  await a.write("speeq.config.ts", CONFIG);
  await a.write(
    "auth.ts",
    'import NextAuth from "next-auth";\nexport const { handlers, auth } = NextAuth({ providers: [] });\n',
  );
  await a.write(
    "app/api/cart/route.ts",
    'import { NextResponse } from "next/server";\nimport { auth } from "../../../auth";\nexport async function GET() {\n  const session = await auth();\n  const items = await load(session?.user?.id);\n  return NextResponse.json({ items, count: items.length, cardNumber: "x" });\n}\ndeclare function load(id?: string): Promise<unknown[]>;\n',
  );
  return a;
}
const ANSI = new RegExp(`${String.fromCharCode(27)}\\x5b[0-9;]*m`, "g");
const plain = (t: string) => t.replace(ANSI, "");
const run = (a: Awaited<ReturnType<typeof app>>, answers: unknown[], args = ["setup"]) => {
  const prompts = scripted(answers);
  return { prompts, result: a.cli(args, { isTTY: true, prompts }) };
};

describe("speeq setup control center", () => {
  it("shows twelve sections and ranks binding the detected sign-in first", async () => {
    const a = await shop();
    const { result } = run(a, ["cancel"]);
    const r = await result;
    expect(r.code).toBe(0);
    r.stdout = plain(r.stdout);
    for (const n of ["01", "06", "12"]) expect(r.stdout).toContain(`${n}  `);
    expect(r.stdout).toContain("Auth.js (NextAuth v5) detected, not bound");
    expect(r.stdout).toContain(
      "Recommended  Bind Auth.js (NextAuth v5) so the agent knows who is signed in",
    );
    expect(r.stdout).toContain("Cancelled. Nothing was written.");
  });

  it("binds sign-in, approves customer data, renames the agent, saves with a diff, and rolls back", async () => {
    const a = await shop();
    const before = await a.snapshot();
    const { prompts, result } = run(a, [
      "auth",
      "bind:authjs",
      "expose",
      ["displayName"],
      "__done",
      "context",
      "/api/cart",
      "fields",
      ["items", "count"],
      "__done",
      "__done",
      "agent",
      "name",
      "Seekh",
      "personality",
      "educational",
      "__done",
      "memory",
      "mode",
      "persistent",
      "__done",
      "apply",
      true,
      true,
    ]);
    const r = await result;
    expect(r.code, r.stderr).toBe(0);
    r.stdout = plain(r.stdout);
    // The restricted field was never offered.
    expect(prompts.asked).toContain("Fields the agent may see");
    expect(r.stdout).toContain("cardNumber  restricted");
    expect(r.stdout).toContain("Review the changes");
    expect(r.stdout).toContain("npx speeq rollback");
    const config = await a.read("speeq.config.ts");
    expect(config).toContain("...agentSettings,");
    expect(config).toContain("agent: agentProfile,");
    const agent = await a.read(".speeq/generated/agent.ts");
    expect(agent).toContain('name: "Seekh"');
    expect(agent).toContain('"personality":"educational"');
    expect(agent).toContain("resolveUser,");
    expect(agent).toContain("providers: contextProviders");
    const context = await a.read(".speeq/generated/context.ts");
    expect(context).toContain('expose: ["items","count"]');
    expect(context).not.toContain("cardNumber");
    expect(await a.read(".speeq/generated/identity.ts")).toContain('from "../../auth"');
    const setup = JSON.parse(await a.read(".speeq/setup.json"));
    expect(setup).toMatchObject({ setupVersion: 2, name: "Seekh", memory: { mode: "persistent" } });

    const back = await a.cli(["rollback"]);
    expect(back.code).toBe(0);
    const after = await a.snapshot();
    expect(after["speeq.config.ts"]).toBe(before["speeq.config.ts"]);
    expect(JSON.parse(after[".speeq/setup.json"] ?? "{}").memory).toBeUndefined();
    expect(after[".speeq/generated/agent.ts"]).toBeUndefined();
  });

  it("configures MongoDB without ever printing the URI", async () => {
    const a = await shop();
    const { result } = run(a, [
      "storage",
      "store",
      "mongodb",
      URI,
      "shop",
      false,
      "__done",
      "apply",
      true,
    ]);
    const r = await result;
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toContain("S3cretPass");
    expect(r.stdout + r.stderr).not.toContain(URI);
    const env = await a.read(".env.local");
    expect(env).toContain(`SPEEQ_MONGODB_URI=${URI}`);
    expect(env).toContain("SPEEQ_MONGODB_DB=shop");
    expect(await a.read(".gitignore")).toContain(".env*.local");
    const agent = await a.read(".speeq/generated/agent.ts");
    expect(agent).toContain("createMongoStore({ db: mongoDb })");
    expect(agent).not.toContain("S3cretPass");
    expect(await a.read("speeq.config.ts")).not.toMatch(/^\s*store,\s*$/m);
    expect(JSON.stringify(JSON.parse(await a.read(".speeq/setup.json")))).not.toContain("S3cret");
  });

  it("refuses a value that is not a MongoDB URI", async () => {
    const a = await shop();
    const r = await run(a, ["storage", "store", "mongodb", "postgres://x", "__done", "cancel"])
      .result;
    expect(r.stdout).toContain("does not look like a MongoDB URI");
    expect(await a.read(".env.local").catch(() => "")).not.toContain("postgres");
  });

  it("asks before throwing away unsaved changes, and writes nothing on exit", async () => {
    const a = await shop();
    const before = await a.snapshot();
    const { prompts, result } = run(a, ["agent", "name", "Seekh", "__done", "cancel", true]);
    const r = await result;
    expect(r.code).toBe(0);
    expect(prompts.asked).toContain("You have unsaved changes. Exit anyway and lose them?");
    expect(await a.snapshot()).toEqual(before);
  });

  it("deep-links into a section and rejects unknown ones", async () => {
    const a = await shop();
    const { prompts, result } = run(a, ["__done", "cancel"], ["setup", "05"]);
    expect((await result).code).toBe(0);
    expect(prompts.asked[0]).toBe("05 Authentication and identity");
    const bad = await a.cli(["setup", "colours"], { isTTY: true, prompts: scripted([]) });
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("Unknown section");
  });

  it("prints the state as JSON without a terminal: evidence, never secrets", async () => {
    const a = await shop();
    await a.write(".env.local", `SPEEQ_MONGODB_URI=${URI}\n`);
    const r = await a.cli(["setup", "--json"]);
    expect(r.code).toBe(0);
    const doc = r.json();
    expect(doc.auth).toEqual([
      expect.objectContaining({
        provider: "authjs",
        level: "implementation-detected",
        evidence: ["auth.ts:2"],
      }),
    ]);
    expect(doc.dataSources).toEqual([
      expect.objectContaining({ id: "cart", binding: "bindable", authEvidence: "helper-called" }),
    ]);
    expect(doc.recommended).toMatchObject({ section: "auth" });
    expect(r.stdout).not.toContain("S3cretPass");
  });
});

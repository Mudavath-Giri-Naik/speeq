import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataSourceCandidate } from "@speeq/compiler";
import { scan } from "@speeq/compiler";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  applyPlan,
  buildPlan,
  type ControlInput,
  nodeFs,
  planSettingsSave,
  readAgentChoices,
  readSetup,
  recommend,
  renderAgentModule,
  rollback,
  type Setup,
  sectionStatuses,
  setupText,
  wireAgentSettings,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "../../../fixtures/compiler");
const umbrella = join(here, "..", "..", "speeq", "src");
const norm = (s: string) => s.split("\\").join("/");

const INIT_CONFIG = `// Created by \`speeq init\`. This file is yours: speeq never overwrites it.
import { createSpeeq } from "speeq/server";
import { createMemoryStore } from "speeq/store-memory";
import { routes } from "./.speeq/generated/routes";

const memory = globalThis as { __speeqStore?: ReturnType<typeof createMemoryStore> };
const store = (memory.__speeqStore ??= createMemoryStore());

export const speeq = createSpeeq({
  secret: process.env.SPEEQ_SECRET,
  agent: { name: "Assistant", instructions: "You help people use this website.", languages: ["en-IN"] },
  llm: makeLlm(),
  // In-memory store: conversations are lost when the server restarts. Use speeq/store-mongodb for production.
  store,
  // Return the signed-in user from your own session, e.g. { id: session.user.id }.
  // resolveUser: async (request) => null,
  routes,
});
`;
const paths = { configFile: "speeq.config.ts", agentFile: ".speeq/generated/agent.ts" };

describe("setup.json version 2", () => {
  it("drops anything malformed or unsafe before it can be rendered into code", () => {
    const c = readAgentChoices({
      agent: {
        instructions: "Be kind.\nUse short answers.",
        style: { personality: "evil", responseLength: "short" },
        temperature: 9,
      },
      business: { name: 'Shop"; process.exit(1); //', offerings: ["a", 5, "b"], sensitive: "yes" },
      memory: { mode: "forever" },
      identity: {
        binding: { kind: "authjs", file: "../../etc/passwd.ts", exportName: "auth" },
        expose: ["displayName", "email"],
      },
      context: {
        sources: [
          { id: "Cart!", path: "/api/cart", fields: ["items"] },
          { id: "cart", path: "/api/cart", fields: [] },
          { id: "orders", path: "/api/orders", fields: ["items"], load: "always" },
        ],
      },
      store: { kind: "postgres" },
    });
    expect(c.agent).toEqual({
      instructions: "Be kind.\nUse short answers.",
      style: { responseLength: "short" },
      temperature: 2,
    });
    expect(c.business).toEqual({ name: 'Shop"; process.exit(1); //', offerings: ["a", "b"] });
    expect(c.memory).toBeUndefined();
    expect(c.store).toBeUndefined();
    expect(c.identity).toEqual({ expose: ["displayName"] });
    expect(c.context?.sources).toEqual([
      {
        id: "orders",
        path: "/api/orders",
        category: "custom",
        description: "orders",
        fields: ["items"],
        load: "on-demand",
      },
    ]);
    // Even a hostile string is only ever data in the generated module.
    const src = renderAgentModule({
      choices: c,
      name: "A",
      languages: ["en-IN"],
      hasIdentity: false,
      hasContext: false,
    });
    expect(src).toContain(JSON.stringify('Shop"; process.exit(1); //'));
    expect(ts.transpileModule(src, { reportDiagnostics: true }).diagnostics).toEqual([]);
  });

  it("writes version 1 until control-center settings exist, and reads both", () => {
    const base: Setup = {
      setupVersion: 1,
      provider: "groq",
      voice: "browser",
      languages: ["en-IN"],
      ui: true,
      env: true,
    };
    expect(JSON.parse(setupText(base)).setupVersion).toBe(1);
    const v2 = JSON.parse(setupText({ ...base, memory: { mode: "persistent" } }));
    expect(v2).toMatchObject({ setupVersion: 2, provider: "groq", memory: { mode: "persistent" } });
  });
});

describe("wiring speeq.config.ts", () => {
  it("replaces the init agent object, spreads the settings first, and is idempotent", () => {
    const r = wireAgentSettings(INIT_CONFIG, paths);
    if ("reason" in r) throw new Error(r.reason);
    expect(r.text).toContain(
      'import { agentProfile, agentSettings } from "./.speeq/generated/agent";',
    );
    expect(r.text).toMatch(/createSpeeq\(\{\n {2}\.\.\.agentSettings,\n {2}secret/);
    expect(r.text).toContain("  agent: agentProfile,");
    expect(r.text).not.toContain('name: "Assistant"');
    expect(r.overrides).toEqual([]);
    const again = wireAgentSettings(r.text, paths);
    expect("reason" in again ? again.reason : again.text).toBe(r.text);
  });

  it("keeps a hand-written agent and reports what it overrides", () => {
    const custom = INIT_CONFIG.replace(
      /agent: \{[^\n]*\},/,
      'agent: {\n    name: "Mine",\n    instructions: buildInstructions(),\n  },\n  memory: { mode: "session" },',
    );
    const r = wireAgentSettings(custom, paths);
    if ("reason" in r) throw new Error(r.reason);
    expect(r.text).toContain("agent: { ...agentProfile,");
    expect(r.text).toContain("buildInstructions()");
    expect(r.overrides.sort()).toEqual(["agent.instructions", "agent.name", "memory"]);
  });

  it("takes out the in-memory store only when MongoDB is chosen", () => {
    const r = wireAgentSettings(INIT_CONFIG, { ...paths, mongo: true });
    if ("reason" in r) throw new Error(r.reason);
    expect(r.text).not.toMatch(/^\s*store,\s*$/m);
    expect(r.text).not.toContain("In-memory store:");
    const own = INIT_CONFIG.replace("  store,", "  store: createPostgresStore(pool),");
    const r2 = wireAgentSettings(own, { ...paths, mongo: true });
    if ("reason" in r2) throw new Error(r2.reason);
    expect(r2.text).toContain("createPostgresStore(pool)");
    expect(r2.overrides).toContain("store");
  });

  it("refuses a file without createSpeeq({ ... }) instead of guessing", () => {
    expect(wireAgentSettings("export const speeq = make();\n", paths)).toEqual({
      reason: "no `createSpeeq({ ... })` call was found",
    });
  });
});

describe("home screen status and recommendation", () => {
  const input = (over: Partial<ControlInput> = {}): ControlInput => ({
    choices: {},
    provider: "groq",
    model: "llama",
    keyPresent: true,
    voice: "browser",
    languages: ["en-IN"],
    ui: true,
    sourceCount: 0,
    wiring: "not-wired",
    mongoUriPresent: false,
    ...over,
  });

  it("ranks broken before security review before binding before persistence before polish", () => {
    const auth = { provider: "supabase", label: "Supabase Auth", level: "implementation-detected" };
    expect(recommend(input({ keyPresent: false, auth }))?.section).toBe("model");
    expect(recommend(input({ auth: { ...auth, level: "requires-review" } }))?.section).toBe("auth");
    expect(recommend(input({ auth }))).toMatchObject({
      section: "auth",
      text: "Bind Supabase Auth so the agent knows who is signed in",
    });
    const bound = { identity: { binding: { kind: "clerk" as const }, provider: "Clerk" } };
    expect(
      recommend(input({ auth, choices: { ...bound, memory: { mode: "persistent" } } }))?.section,
    ).toBe("storage");
    expect(recommend(input({ auth, choices: bound, sourceCount: 2 }))?.section).toBe("context");
    expect(recommend(input())?.section).toBe("business");
  });

  it("never shows an unbound or unverified thing as done", () => {
    const s = sectionStatuses(
      input({
        auth: { provider: "authjs", label: "Auth.js", level: "provider-detected" },
        choices: { store: { kind: "mongodb" } },
      }),
    );
    const by = Object.fromEntries(s.map((x) => [x.id, x]));
    expect(by.auth?.badge).toBe("review");
    expect(by.storage).toMatchObject({
      badge: "broken",
      detail: "MongoDB chosen, SPEEQ_MONGODB_URI missing",
    });
    expect(by.verify?.badge).toBe("review");
    expect(s.map((x) => x.id)).toHaveLength(12);
  });
});

const STUBS: Record<string, string> = {
  "auth.ts":
    "export declare function auth(): Promise<{ user?: { name?: string | null; email?: string | null } } | null>;\n",
  "stubs/mongodb.d.ts":
    'declare module "mongodb" {\n  export interface Db { collection(name: string): unknown }\n  export class MongoClient { static connect(uri: string): Promise<MongoClient>; db(name?: string): Db }\n}\n',
};

describe("saving settings", () => {
  it("writes agent, identity and context modules, wires the config, type-checks, and rolls back", async () => {
    const dir = await mkdtemp(join(here, "..", ".gen-settings-"));
    try {
      await cp(join(fixtures, "server-actions"), dir, { recursive: true });
      for (const [f, t] of Object.entries(STUBS)) {
        await mkdir(dirname(join(dir, f)), { recursive: true });
        await writeFile(join(dir, f), t);
      }
      const r = await scan({ root: dir });
      if (r.status !== "ok") throw new Error(r.status);
      const fs = nodeFs(dir);
      const init = await buildPlan({
        manifest: r.manifest,
        decisions: undefined,
        fs,
        options: { prefix: "", appRouterDir: "app", speeqVersion: "0.12.0", remember: true },
      });
      expect((await applyPlan(fs, init)).status).toBe("applied");
      const original = await readFile(join(dir, "speeq.config.ts"), "utf8");
      const setup = await readSetup(fs, "");
      if (!setup) throw new Error("no setup");
      const cart: DataSourceCandidate = {
        id: "cart",
        title: "Cart",
        capabilityId: "endpoint:GET /api/cart",
        type: "endpoint",
        method: "GET",
        path: "/api/cart",
        location: { file: "app/api/cart/route.ts", line: 1 },
        category: "commerce",
        because: "path /api/cart",
        fields: [
          { name: "items", sensitive: false },
          { name: "count", sensitive: false },
        ],
        requiredInputs: [],
        authEvidence: "helper-called",
        customerScope: "user-referenced",
        binding: "bindable",
        evidence: [],
      };
      const next: Setup = {
        ...setup,
        name: "Seekh",
        agent: {
          description: "Helps students practise.",
          instructions: "Explain step by step.",
          style: { personality: "educational" },
        },
        business: { name: "SwaSeekh", description: "GATE preparation" },
        greeting: { guest: ["Welcome to {business}!"], member: ["Welcome back, {name}!"] },
        starters: [{ label: "Show my cart", when: { auth: "member", requires: ["cart"] } }],
        memory: { mode: "persistent" },
        store: { kind: "mongodb" },
        identity: {
          binding: { kind: "authjs", file: "auth.ts", exportName: "auth" },
          provider: "Auth.js",
          expose: ["displayName"],
        },
        context: {
          sources: [
            {
              id: "cart",
              path: "/api/cart",
              category: "commerce",
              description: "Cart",
              fields: ["items", "count"],
              load: "on-demand",
            },
            {
              id: "gone",
              path: "/api/gone",
              category: "custom",
              description: "x",
              fields: ["a"],
              load: "on-demand",
            },
          ],
        },
      };
      const saved = await planSettingsSave({ fs, prefix: "", setup: next, candidates: [cart] });
      expect(saved.overrides).toEqual([]);
      expect(saved.notes.join(" ")).toMatch(/gone .*not found/);
      const applied = await applyPlan(fs, saved.plan);
      expect(applied.status).toBe("applied");
      const config = await readFile(join(dir, "speeq.config.ts"), "utf8");
      expect(config).toContain("...agentSettings,");
      expect(config).toContain("agent: agentProfile,");
      const agent = await readFile(join(dir, ".speeq/generated/agent.ts"), "utf8");
      expect(agent).toContain('"Seekh"');
      expect(agent).toContain("resolveUser,");
      expect(agent).toContain("createMongoStore({ db: mongoDb })");
      expect((await readSetup(fs, ""))?.memory).toEqual({ mode: "persistent" });

      const roots = [
        "speeq.config.ts",
        ".speeq/generated/agent.ts",
        ".speeq/generated/identity.ts",
        ".speeq/generated/context.ts",
        "stubs/mongodb.d.ts",
      ].map((f) => join(dir, f));
      const program = ts.createProgram(roots, {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        customConditions: ["@speeq/source"],
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

      // Saving again with the same settings changes nothing.
      const again = await planSettingsSave({ fs, prefix: "", setup: next, candidates: [cart] });
      expect(again.plan.changes.filter((c) => c.action !== "keep")).toEqual([]);

      const back = await rollback(fs, "");
      expect(back.status).toBe("done");
      expect(await readFile(join(dir, "speeq.config.ts"), "utf8")).toBe(original);
      expect(await fs.read(".speeq/generated/agent.ts")).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("does not overwrite a generated file edited by hand unless asked", async () => {
    const dir = await mkdtemp(join(here, "..", ".gen-settings-"));
    try {
      const fs = nodeFs(dir);
      await fs.write("speeq.config.ts", INIT_CONFIG);
      const setup: Setup = {
        setupVersion: 1,
        provider: "mock",
        voice: "none",
        languages: ["en-IN"],
        ui: false,
        env: false,
      };
      const first = await planSettingsSave({ fs, prefix: "", setup, candidates: [] });
      await applyPlan(fs, first.plan);
      const agent = (await fs.read(".speeq/generated/agent.ts")) ?? "";
      await fs.write(".speeq/generated/agent.ts", `${agent}// my change\n`);
      const next = { ...setup, business: { name: "X" } };
      const blocked = await planSettingsSave({ fs, prefix: "", setup: next, candidates: [] });
      expect(blocked.edited).toEqual([".speeq/generated/agent.ts"]);
      expect((await applyPlan(fs, blocked.plan)).status).toBe("conflict");
      const forced = await planSettingsSave({
        fs,
        prefix: "",
        setup: next,
        candidates: [],
        force: blocked.edited,
      });
      expect((await applyPlan(fs, forced.plan)).status).toBe("applied");
      expect(await fs.read(".speeq/generated/agent.ts")).not.toContain("// my change");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { SPEEQ_PACKAGE_VERSION } from "../src/index.js";
import { app, noPrompts, scripted } from "./helpers.js";

type App = Awaited<ReturnType<typeof app>>;
const open: App[] = [];
async function make(fixture: string) {
  const a = await app(fixture);
  open.push(a);
  return a;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((a) => a.cleanup()));
});
const ROUTE = "route:/subjects";
const ADD = "function:app/actions.ts#addItem";

describe("usage and exit codes", () => {
  it("returns 2 for an unknown command or flag, with a JSON error when asked", async () => {
    const a = await make("next-app-minimal");
    expect((await a.cli(["frobnicate"])).code).toBe(2);
    expect((await a.cli(["init", "--nope"])).code).toBe(2);
    const j = await a.cli(["frobnicate", "--json"]);
    expect(j.code).toBe(2);
    expect(j.json()).toMatchObject({
      speeq: 1,
      ok: false,
      exitCode: 2,
      errors: [{ code: "usage" }],
    });
  });
  it("prints help and a version that matches the umbrella package", async () => {
    const a = await make("next-app-minimal");
    expect((await a.cli(["--help"])).stdout).toContain("Exit codes");
    const v = await a.cli(["--version"]);
    expect(v.stdout.trim()).toBe(SPEEQ_PACKAGE_VERSION);
    const umbrella = JSON.parse(
      readFileSync(new URL("../../speeq/package.json", import.meta.url), "utf8"),
    );
    expect(SPEEQ_PACKAGE_VERSION).toBe(umbrella.version);
  });
  it("returns 4 for a project that is not a supported Next.js app", async () => {
    for (const f of ["no-next", "old-next"]) {
      const a = await make(f);
      expect((await a.cli(["scan"])).code).toBe(4);
    }
  });
  it("returns 2 when several apps exist and none was chosen, and works with --app", async () => {
    const a = await make("monorepo-pnpm-two-apps");
    const r = await a.cli(["scan", "--json"]);
    expect(r.code).toBe(2);
    expect(r.json().errors).toMatchObject([{ code: "needs-selection" }]);
    expect((await a.cli(["scan", "--app", "apps/web", "--dry-run"])).code).not.toBe(2);
  });
  it("returns 3 when capabilities wait for review and 0 once they are decided", async () => {
    const a = await make("next-app-minimal");
    expect((await a.cli(["init"])).code).toBe(3);
    expect((await a.cli(["capabilities", "enable", ROUTE])).code).toBe(0);
    expect((await a.cli(["init"])).code).toBe(0);
    expect((await a.cli(["scan"])).code).toBe(0);
  });
  it("returns 1 for a hand-edited generated file and leaves it alone", async () => {
    const a = await make("next-app-minimal");
    await a.cli(["capabilities", "enable", ROUTE]);
    await a.cli(["init"]);
    const edited = `${await a.read(".speeq/generated/routes.ts")}// mine\n`;
    await a.write(".speeq/generated/routes.ts", edited);
    const r = await a.cli(["upgrade", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json().errors).toMatchObject([{ code: "conflict" }]);
    expect(await a.read(".speeq/generated/routes.ts")).toBe(edited);
  });
  it("capabilities: unknown id is 2, credentials are 4, bad flags are 2", async () => {
    const a = await make("endpoints-input");
    expect((await a.cli(["capabilities", "enable", "route:/nope"])).code).toBe(2);
    expect((await a.cli(["capabilities", "enable", "endpoint:POST /api/pay"])).code).toBe(4);
    expect(
      (await a.cli(["capabilities", "enable", "endpoint:GET /api/query", "--access", "root"])).code,
    ).toBe(2);
    expect(
      (await a.cli(["capabilities", "enable", "endpoint:GET /api/query", "--auth", "roles"])).code,
    ).toBe(2);
    expect((await a.cli(["capabilities", "enable"])).code).toBe(2);
    expect((await a.cli(["capabilities", "wat"])).code).toBe(2);
    expect(await a.read(".speeq/decisions.json").catch(() => "none")).toBe("none");
  });
  it("verify and doctor: exit codes, separate levels, JSON, and host commands only with --run-host", async () => {
    const a = await make("next-app-minimal");
    expect((await a.cli(["capabilities", "enable", ROUTE])).code).toBe(0);
    expect((await a.cli(["init"])).code).toBe(0);
    const bad = await a.cli(["verify", "--json"]);
    expect(bad.code).toBe(1);
    expect(bad.json()).toMatchObject({
      command: "verify",
      ok: false,
      readiness: { static: "fail" },
    });
    await a.write(
      "package.json",
      JSON.stringify({
        scripts: { typecheck: "tsc" },
        dependencies: { next: "16", zod: "4", speeq: "0.4.0" },
      }),
    );
    const calls: string[] = [];
    const exec = async (c: string, args: string[]) => {
      calls.push(`${c} ${args.join(" ")}`);
      return 0;
    };
    const ok = await a.cli(["verify", "--json"], { exec });
    expect(ok.code).toBe(0);
    expect(ok.json().readiness).toEqual({ static: "pass", runtime: "pass", host: "not-run" });
    expect(calls).toEqual([]);
    const host = await a.cli(["verify", "--json", "--run-host"], { exec });
    expect(host.json().readiness).toMatchObject({ host: "pass" });
    expect(calls).toHaveLength(1);
    const doc = await a.cli(["doctor", "--json"]);
    expect(doc.code).toBe(0);
    expect(doc.json().readiness).toEqual({ static: "pass", runtime: "not-run", host: "not-run" });
    const human = await a.cli(["verify"]);
    expect(human.stdout).toContain("Runtime (mock model");
    expect(human.stdout).toContain("Not verified here: a live model provider");
    expect((await a.cli(["verify", "--bogus"])).code).toBe(2);
  });
  it("verify exits 3 when decisions are pending and 4 for an unsupported project", async () => {
    const a = await make("next-app-minimal");
    expect((await a.cli(["init"])).code).toBe(3);
    await a.write(
      "package.json",
      JSON.stringify({ dependencies: { next: "16", zod: "4", speeq: "0.4.0" } }),
    );
    expect((await a.cli(["verify"])).code).toBe(3);
    const n = await make("no-next");
    expect((await n.cli(["verify"])).code).toBe(4);
    expect((await n.cli(["doctor", "--json"])).json()).toMatchObject({ exitCode: 4 });
  });
  it("rollback with nothing to undo is 1", async () => {
    const a = await make("next-app-minimal");
    expect((await a.cli(["rollback"])).code).toBe(1);
  });
});

describe("--json", () => {
  it("prints exactly one document with fixed keys", async () => {
    const a = await make("next-app-minimal");
    for (const args of [["init"], ["scan"], ["upgrade"], ["configure"], ["capabilities", "list"]]) {
      const r = await a.cli([...args, "--json"]);
      expect(r.stdout.trim().split("\n")).toHaveLength(1);
      const doc = r.json();
      expect(doc).toMatchObject({ speeq: 1, command: args[0], exitCode: r.code, errors: [] });
      expect(typeof doc.ok).toBe("boolean");
    }
    const init = (await a.cli(["init", "--json", "--dry-run"])).json();
    expect(Object.keys(init.plan as object).sort()).toEqual(
      [
        "changes",
        "conflicts",
        "dependencies",
        "env",
        "manual",
        "pending",
        "skipped",
        "stale",
        "wrapped",
      ].sort(),
    );
    expect(init).toMatchObject({ applied: "dry-run", project: { framework: "nextjs-app" } });
  });
  it("prints nothing else on stdout", async () => {
    const a = await make("next-app-minimal");
    const r = await a.cli(["init", "--json"]);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });
});

describe("dry run, diff and idempotency", () => {
  it("writes nothing with --dry-run, and shows a diff with --diff", async () => {
    const a = await make("next-app-minimal");
    await a.cli(["capabilities", "enable", ROUTE]);
    const before = await a.snapshot();
    const r = await a.cli(["init", "--dry-run", "--diff"]);
    expect(await a.snapshot()).toEqual(before);
    expect(r.stdout).toContain("+++ .speeq/generated/routes.ts");
    for (const c of ["scan", "upgrade", "capabilities enable route:/subjects", "rollback"]) {
      await a.cli([...c.split(" "), "--dry-run"]);
      expect(await a.snapshot()).toEqual(before);
    }
  });
  it("a second init changes nothing", async () => {
    const a = await make("next-app-minimal");
    await a.cli(["capabilities", "enable", ROUTE]);
    expect((await a.cli(["init"])).code).toBe(0);
    const after = await a.snapshot();
    const again = await a.cli(["init", "--json"]);
    expect(again.json()).toMatchObject({ applied: "noop" });
    expect(
      (again.json().plan as { changes: { action: string }[] }).changes.every(
        (c) => c.action === "keep",
      ),
    ).toBe(true);
    expect(await a.snapshot()).toEqual(after);
  });
  it("rollback restores the tree from before init", async () => {
    const a = await make("next-app-minimal");
    const before = await a.snapshot();
    await a.cli(["init"]);
    expect(await a.snapshot()).not.toEqual(before);
    const r = await a.cli(["rollback"]);
    expect(r.code).toBe(0);
    expect(await a.snapshot()).toEqual(before);
  });
  it("rollback keeps a file edited after init and exits 1", async () => {
    const a = await make("next-app-minimal");
    await a.cli(["capabilities", "enable", ROUTE]);
    await a.cli(["init"]);
    await a.write(".speeq/generated/routes.ts", "// mine\n");
    const r = await a.cli(["rollback", "--json"]);
    expect(r.code).toBe(1);
    expect(await a.read(".speeq/generated/routes.ts")).toBe("// mine\n");
    expect(r.json().skipped).toHaveLength(1);
  });
});

describe("decisions", () => {
  it("enable records the current fingerprint, and decisions survive scan and upgrade", async () => {
    const a = await make("server-actions");
    expect((await a.cli(["capabilities", "enable", ADD, "--auth", "authenticated"])).code).toBe(0);
    const d = JSON.parse(await a.read(".speeq/decisions.json"));
    const m = (await a.cli(["capabilities", "show", ADD, "--json"])).json().capability as {
      fingerprint: string;
    };
    expect(d.capabilities[ADD]).toMatchObject({
      review: "approved",
      approvedFingerprint: m.fingerprint,
      auth: { requirement: "authenticated" },
    });
    await a.cli(["scan"]);
    await a.cli(["upgrade"]);
    expect(JSON.parse(await a.read(".speeq/decisions.json"))).toEqual(d);
    const list = (await a.cli(["capabilities", "list", "--json", "--status", "executable"])).json();
    expect((list.capabilities as { id: string }[]).map((c) => c.id)).toEqual([ADD]);
  });
  it("a changed fingerprint stops execution: wrapper removed, stale reported, exit 3", async () => {
    const a = await make("server-actions");
    await a.cli(["capabilities", "enable", ADD, "--auth", "public"]);
    await a.cli(["upgrade"]);
    expect(await a.read(".speeq/generated/tools.ts")).toContain("addItem");
    await a.write(
      "app/actions.ts",
      (await a.read("app/actions.ts")).replace("z.string()", "z.string().min(3)"),
    );
    const r = await a.cli(["upgrade", "--json"]);
    expect(r.code).toBe(3);
    expect((r.json().reconcile as { stale: string[] }).stale).toEqual([ADD]);
    expect(await a.read(".speeq/generated/tools.ts")).not.toContain("addItem");
    expect(JSON.parse(await a.read(".speeq/decisions.json")).capabilities[ADD].review).toBe(
      "approved",
    );
  });
  it("an invalid decisions file is an error, never silently reset", async () => {
    const a = await make("next-app-minimal");
    await a.write(".speeq/decisions.json", "{ nope");
    const r = await a.cli(["scan", "--json"]);
    expect(r.code).toBe(1);
    expect(await a.read(".speeq/decisions.json")).toBe("{ nope");
  });
  it("disable stops wrapping", async () => {
    const a = await make("next-app-minimal");
    await a.cli(["capabilities", "enable", ROUTE]);
    await a.cli(["init"]);
    expect(await a.read(".speeq/generated/routes.ts")).toContain("/subjects");
    await a.cli(["capabilities", "disable", ROUTE]);
    await a.cli(["upgrade"]);
    expect(await a.read(".speeq/generated/routes.ts")).not.toContain("/subjects");
  });
});

describe("interactive and CI mode", () => {
  it("never prompts without a terminal, with --yes, --ci or CI set", async () => {
    const a = await make("next-app-minimal");
    for (const [args, over] of [
      [["init"], { isTTY: false }],
      [["init", "--yes"], { isTTY: true }],
      [["init", "--ci"], { isTTY: true }],
      [["init"], { isTTY: true, env: { CI: "true" } }],
      [["init", "--json"], { isTTY: true }],
    ] as const) {
      const r = await a.cli([...args], { ...over, prompts: noPrompts });
      expect([0, 3]).toContain(r.code);
    }
  });
  it("init in a terminal asks, approves only what was selected, and applies", async () => {
    const a = await make("next-app-minimal");
    const prompts = scripted([
      "mock",
      "browser",
      ["en-IN"],
      true,
      true,
      ["audit"],
      [ROUTE],
      true,
      false,
    ]);
    const r = await a.cli(["init"], { isTTY: true, prompts });
    expect(r.code).toBe(0);
    expect(prompts.asked).toHaveLength(9);
    const d = JSON.parse(await a.read(".speeq/decisions.json"));
    expect(Object.keys(d.capabilities)).toEqual([ROUTE]);
    expect(await a.read("speeq.config.ts")).toContain("createMockLLMProvider");
    expect(await a.read("speeq.config.ts")).toContain("audit:");
    expect(await a.read("speeq.config.ts")).not.toContain("telemetry:");
  });
  it("answering no to the apply question writes nothing but decisions", async () => {
    const a = await make("next-app-minimal");
    const r = await a.cli(["init"], {
      isTTY: true,
      prompts: scripted(["mock", "browser", ["en-IN"], true, true, [], [], false]),
    });
    expect(r.code).toBe(1);
    const files = Object.keys(await a.snapshot());
    expect(files).not.toContain("speeq.config.ts");
    expect(files).not.toContain(".speeq/generated/tools.ts");
  });
  it("installs dependencies only on request, with exact versions and no scripts", async () => {
    const a = await make("next-app-minimal");
    await a.cli(["capabilities", "enable", ROUTE]);
    const calls: string[][] = [];
    const exec = async (c: string, args: string[]) => {
      calls.push([c, ...args]);
      return 0;
    };
    await a.cli(["init"], { exec });
    expect(calls).toEqual([]);
    await a.cli(["rollback"]);
    await a.cli(["init", "--install", "--json"], { exec });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.arrayContaining(["--ignore-scripts", `speeq@${SPEEQ_PACKAGE_VERSION}`]),
    );
    expect(calls[0]?.join(" ")).toMatch(/--save-exact|--exact/);
  });
  it("configure without a terminal only reports", async () => {
    const a = await make("next-app-minimal");
    const before = await a.snapshot();
    const r = await a.cli([], { prompts: noPrompts });
    expect([0, 3]).toContain(r.code);
    expect(await a.snapshot()).toEqual(before);
  });
});

const LAYOUT = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
`;

describe("onboarding: provider, voice, env names and the chat box", () => {
  async function withLayout() {
    const a = await make("next-app-minimal");
    await a.write("app/layout.tsx", LAYOUT);
    await a.write(".gitignore", "node_modules\n");
    return a;
  }
  it("with flags and no terminal: writes the widget, splices the layout, writes env names", async () => {
    const a = await withLayout();
    const r = await a.cli([
      "init",
      "--provider",
      "groq",
      "--voice",
      "browser",
      "--languages",
      "en-IN,te-IN",
    ]);
    expect([0, 3]).toContain(r.code); // 3: capabilities still wait for review
    expect(await a.read("components/speeq/assistant.tsx")).toContain("SpeeqProvider");
    expect(await a.read("app/layout.tsx")).toContain("<SpeeqAssistant />");
    const env = await a.read(".env.local");
    expect(env).toContain("GROQ_API_KEY=\n");
    expect(env).toContain("SPEEQ_LLM_MODEL=\n");
    expect(env).toMatch(/SPEEQ_SECRET=\S{48}/);
    expect(await a.read(".env.example")).toContain("GROQ_API_KEY=\n");
    expect(await a.read(".gitignore")).toContain(".env*.local");
    expect(await a.read("speeq.config.ts")).toContain("https://api.groq.com/openai/v1");
    expect(JSON.parse(await a.read(".speeq/setup.json"))).toMatchObject({
      provider: "groq",
      voice: "browser",
      languages: ["en-IN", "te-IN"],
      ui: true,
    });
  });
  it("defaults to mock mode, browser voice and the chat box", async () => {
    const a = await withLayout();
    expect([0, 3]).toContain((await a.cli(["init"])).code);
    expect(await a.read("components/speeq/assistant.tsx")).toContain("const MOCK = true");
    expect(await a.read("speeq.config.ts")).toContain("createMockLLMProvider");
    expect(await a.read(".env.local")).not.toContain("GROQ_API_KEY");
  });
  it("--no-ui and --no-env skip those files", async () => {
    const a = await withLayout();
    await a.cli(["init", "--no-ui", "--no-env"]);
    const files = Object.keys(await a.snapshot());
    expect(files).not.toContain("components/speeq/assistant.tsx");
    expect(files).not.toContain(".env.local");
    expect(await a.read("app/layout.tsx")).toBe(LAYOUT);
  });
  it("never reads values out of an existing .env.local and a second init changes nothing", async () => {
    const a = await withLayout();
    await a.write(".env.local", "GROQ_API_KEY=gsk_live_value\n");
    const r = await a.cli(["init", "--provider", "groq", "--json", "--diff"]);
    expect(r.stdout).not.toContain("gsk_live_value");
    expect(await a.read(".env.local")).toContain("GROQ_API_KEY=gsk_live_value");
    const after = await a.snapshot();
    const again = await a.cli(["init", "--json"]);
    expect(again.json()).toMatchObject({ applied: "noop" });
    expect(await a.snapshot()).toEqual(after);
  });
  it("--dry-run writes nothing and shows no secret", async () => {
    const a = await withLayout();
    const before = await a.snapshot();
    const r = await a.cli(["init", "--dry-run", "--diff", "--provider", "groq"]);
    expect(await a.snapshot()).toEqual(before);
    expect(r.stdout).toContain("SPEEQ_SECRET=<generated>");
    expect(r.stdout).not.toMatch(/SPEEQ_SECRET=\S{40,}/);
  });
  it("rejects unknown providers and voices with exit code 2", async () => {
    const a = await withLayout();
    expect((await a.cli(["init", "--provider", "nope"])).code).toBe(2);
    expect((await a.cli(["init", "--voice", "nope"])).code).toBe(2);
  });
  it("asks for provider, voice, languages, chat box and env names in a terminal", async () => {
    const a = await withLayout();
    const prompts = scripted([
      "gemini",
      "cloud",
      ["en-IN", "hi-IN"],
      true,
      true,
      [],
      [],
      true,
      false,
      false, // not now: paste the key later
    ]);
    const r = await a.cli(["init"], { isTTY: true, prompts });
    expect([0, 3]).toContain(r.code); // 3: capabilities still wait for review
    expect(prompts.asked.slice(0, 5)).toEqual([
      "Language model",
      "Voice",
      "Languages",
      "Add the chat box to your layout?",
      "Write the needed variable names into .env.local?",
    ]);
    const env = await a.read(".env.local");
    for (const name of ["GEMINI_API_KEY", "GROQ_STT_MODEL", "GEMINI_STT_MODEL"])
      expect(env).toContain(`${name}=\n`);
    expect(r.stdout).toContain("Next steps");
    expect(r.stdout).toContain(".env.local");
  });
  it("offers to paste the key at the end of init, checks it, and saves the key and model", async () => {
    const a = await withLayout();
    const key = "gsk_INITFLOWKEY1234567890";
    const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
      const h = (init?.headers ?? {}) as Record<string, string>;
      if (h.authorization !== `Bearer ${key}`) return new Response("{}", { status: 401 });
      if (String(url).endsWith("/models"))
        return new Response(JSON.stringify({ data: [{ id: "model-a" }, { id: "model-b" }] }), {
          status: 200,
        });
      return new Response(JSON.stringify({ choices: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const prompts = scripted([
      "groq",
      "browser",
      ["en-IN"],
      true,
      true,
      [],
      [],
      true,
      false,
      true, // paste the key now
      key,
      "model-b",
    ]);
    const r = await a.cli(["init"], { isTTY: true, prompts, fetch: fetchStub });
    expect([0, 3]).toContain(r.code);
    const env = await a.read(".env.local");
    expect(env).toContain(`GROQ_API_KEY=${key}`);
    expect(env).toContain("SPEEQ_LLM_MODEL=model-b");
    expect(r.stdout + r.stderr).not.toContain(key);
    expect(r.stdout).toContain("are saved in .env.local");
    const example = await a.read(".env.example");
    expect(example).not.toContain(key);
    expect(example).toContain("GROQ_API_KEY=\n");
  });
  it("rollback restores the layout and removes the untouched env blocks", async () => {
    const a = await withLayout();
    const before = await a.snapshot();
    await a.cli(["init", "--provider", "groq"]);
    await a.cli(["rollback"]);
    const after = await a.snapshot();
    expect(after["app/layout.tsx"]).toBe(LAYOUT);
    expect(Object.keys(after)).not.toContain(".env.local");
    expect(after[".gitignore"]).toBe(before[".gitignore"]);
  });
});

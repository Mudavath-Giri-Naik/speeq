import { afterEach, describe, expect, it } from "vitest";
import { checkKey, testModel, testModels } from "../src/probe.js";
import { app, scripted } from "./helpers.js";

const KEY = "gsk_SECRETKEY1234567890abcdef";
type Call = { url: string; method: string; headers: Record<string, string>; body: string };

/** A fake provider: answers by URL. Records every call so tests can check where the key went. */
function fake(routes: (call: Call) => Response | undefined) {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: String(init?.body ?? ""),
    };
    calls.push(call);
    return routes(call) ?? new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const groqRoutes = (c: Call) => {
  if (c.headers.authorization !== `Bearer ${KEY}`)
    return json({ error: { message: "Invalid API Key" } }, 401);
  if (c.url.endsWith("/models"))
    return json({
      data: [
        { id: "llama-fast", active: true },
        { id: "whisper-large-v3", active: true },
        { id: "gone-model", active: false },
        { id: "llama-guard-4", active: true },
        { id: "slow-one", active: true },
        { id: "limited-one", active: true },
        { id: "broken-one", active: true },
      ],
    });
  const model = (JSON.parse(c.body) as { model: string }).model;
  if (model === "limited-one") return json({ error: { message: "rate" } }, 429);
  if (model === "broken-one")
    return json({ error: { message: `The model does not exist for ${KEY}` } }, 404);
  return json({ choices: [{ message: { content: "ok" } }] });
};

describe("checkKey and testModels", () => {
  it("lists only chat models, and sends the key in a header never in the URL", async () => {
    const { f, calls } = fake(groqRoutes);
    const r = await checkKey({ provider: "groq", key: KEY, fetch: f });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.models.sort()).toEqual(["broken-one", "limited-one", "llama-fast", "slow-one"]);
    expect(calls.every((c) => !c.url.includes(KEY) && !c.body.includes(KEY))).toBe(true);
    expect(calls.every((c) => new URL(c.url).host === "api.groq.com")).toBe(true);
  });
  it("reports a rejected key without echoing it", async () => {
    const { f } = fake(groqRoutes);
    const r = await checkKey({ provider: "groq", key: "wrong-key", fetch: f });
    expect(r).toMatchObject({ ok: false, kind: "rejected" });
    expect(JSON.stringify(r)).not.toContain("wrong-key");
  });
  it("classifies each model and scrubs the key from provider messages", async () => {
    const { f } = fake(groqRoutes);
    const input = { provider: "groq" as const, key: KEY, fetch: f };
    const seen: string[] = [];
    const results = await testModels(input, ["llama-fast", "limited-one", "broken-one"], (r) =>
      seen.push(r.model),
    );
    expect(results.map((r) => r.status)).toEqual(["working", "limited", "failed"]);
    expect(seen.sort()).toEqual(["broken-one", "limited-one", "llama-fast"]);
    expect(JSON.stringify(results)).not.toContain(KEY);
    expect(results[2]?.reason).toContain("***");
  });
  it("gemini: header auth, generateContent filter, 400 means a bad key", async () => {
    const { f, calls } = fake((c) => {
      if (c.headers["x-goog-api-key"] !== "AQ.good")
        return json({ error: { message: "API key not valid" } }, 400);
      if (c.url.includes("/models?"))
        return json({
          models: [
            { name: "models/gemini-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/text-embedding", supportedGenerationMethods: ["embedContent"] },
            { name: "models/gemini-image", supportedGenerationMethods: ["generateContent"] },
          ],
        });
      return json({ candidates: [] });
    });
    const ok = await checkKey({ provider: "gemini", key: "AQ.good", fetch: f });
    expect(ok).toMatchObject({ ok: true, models: ["gemini-flash"] });
    expect(await checkKey({ provider: "gemini", key: "AQ.bad", fetch: f })).toMatchObject({
      ok: false,
      kind: "rejected",
    });
    const t = await testModel({ provider: "gemini", key: "AQ.good", fetch: f }, "gemini-flash");
    expect(t.status).toBe("working");
    expect(calls.some((c) => c.url.endsWith("/models/gemini-flash:generateContent"))).toBe(true);
    expect(calls.every((c) => !c.url.includes("AQ."))).toBe(true);
  });
  it("openrouter: checks the key on its own and only lists free models", async () => {
    const { f, calls } = fake((c) => {
      if (c.url.endsWith("/auth/key"))
        return c.headers.authorization === "Bearer or-key" ? json({}) : json({}, 401);
      if (c.url.endsWith("/models"))
        return json({ data: [{ id: "a/paid" }, { id: "b/free:free" }] });
      return undefined;
    });
    expect(await checkKey({ provider: "openrouter", key: "or-bad", fetch: f })).toMatchObject({
      kind: "rejected",
    });
    const r = await checkKey({ provider: "openrouter", key: "or-key", fetch: f });
    expect(r).toMatchObject({ ok: true, models: ["b/free:free"] });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
  it("refuses a custom base URL that is plain http to a remote host, or has credentials", async () => {
    for (const baseUrl of [
      "http://example.com/v1",
      "https://u:p@example.com/v1",
      "ftp://x",
      "nope",
    ]) {
      const { f, calls } = fake(() => json({}));
      expect(
        await checkKey({ provider: "openai-compatible", key: "k", baseUrl, fetch: f }),
      ).toMatchObject({ ok: false });
      expect(calls).toHaveLength(0);
    }
  });
  it("a network failure is reported as such", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await checkKey({ provider: "groq", key: KEY, fetch: f })).toMatchObject({
      ok: false,
      kind: "network",
    });
  });
});

describe("speeq connect", () => {
  const made: Awaited<ReturnType<typeof app>>[] = [];
  afterEach(async () => {
    for (const a of made.splice(0)) await a.cleanup();
  });
  async function project(extra: Record<string, string> = {}) {
    const a = await app("next-app-minimal");
    made.push(a);
    await a.write(".gitignore", "node_modules\n");
    await a.write(
      ".speeq/setup.json",
      JSON.stringify({
        setupVersion: 1,
        provider: "groq",
        voice: "browser",
        languages: ["en-IN"],
        ui: true,
        env: true,
      }),
    );
    for (const [file, text] of Object.entries(extra)) await a.write(file, text);
    return a;
  }
  const tty = (a: Awaited<ReturnType<typeof app>>, answers: unknown[], f: typeof fetch) => {
    const prompts = scripted(answers);
    return {
      prompts,
      run: (args: string[] = ["connect"]) => a.cli(args, { isTTY: true, prompts, fetch: f }),
    };
  };

  it("checks the key, lists models, saves the key and the chosen model, never printing the key", async () => {
    const a = await project({
      ".env.local": "SPEEQ_SECRET=abc\nGROQ_API_KEY=\nSPEEQ_LLM_MODEL=\n",
    });
    const { f } = fake(groqRoutes);
    const { prompts, run } = tty(a, [KEY, "llama-fast"], f);
    const r = await run();
    expect(r.code).toBe(0);
    const env = await a.read(".env.local");
    expect(env).toContain(`GROQ_API_KEY=${KEY}`);
    expect(env).toContain("SPEEQ_LLM_MODEL=llama-fast");
    expect(env).toContain("SPEEQ_SECRET=abc");
    expect(r.stdout + r.stderr).not.toContain(KEY);
    expect(r.stdout).toContain("llama-fast");
    expect(r.stdout).toMatch(/limited-one/);
    expect(r.stdout).toMatch(/broken-one/);
    expect(prompts.asked[0]).toMatch(/API key/);
    expect(await a.read(".gitignore")).toContain(".env*.local");
  });
  it("a rejected key is not saved and can be retried", async () => {
    const a = await project();
    const { f } = fake(groqRoutes);
    const { run } = tty(a, ["gsk_wrong", KEY, "llama-fast"], f);
    const r = await run();
    expect(r.stdout).toContain("rejected");
    expect(r.stdout).not.toContain("gsk_wrong");
    expect(await a.read(".env.local")).toContain(`GROQ_API_KEY=${KEY}`);
  });
  it("Enter on the key prompt skips everything and writes nothing", async () => {
    const a = await project();
    const { f, calls } = fake(groqRoutes);
    const before = await a.snapshot();
    const r = await tty(a, [""], f).run();
    expect(r.code).toBe(0);
    expect(calls).toHaveLength(0);
    expect(await a.snapshot()).toEqual(before);
  });
  it("asks before replacing a value that is already there, and keeps it on no", async () => {
    const a = await project({ ".env.local": "GROQ_API_KEY=existing\n" });
    const { f } = fake((c) =>
      c.headers.authorization === "Bearer new-key"
        ? groqRoutes({ ...c, headers: { authorization: `Bearer ${KEY}` } })
        : undefined,
    );
    const { prompts, run } = tty(a, ["new-key", "llama-fast", false], f);
    await run();
    expect(prompts.asked.some((m) => /already has a value/.test(m))).toBe(true);
    expect(await a.read(".env.local")).toContain("GROQ_API_KEY=existing");
  });
  it("offers to switch a config that still uses another provider, with a backup copy", async () => {
    const config = `import { createSpeeq } from "speeq/server";
import { createGeminiProvider } from "speeq/llm-gemini";
export const speeq = createSpeeq({
  llm: createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY ?? "", model: process.env.SPEEQ_LLM_MODEL ?? "" }),
});
`;
    const a = await project({ "speeq.config.ts": config });
    const { f } = fake(groqRoutes);
    const r = await tty(a, [KEY, "llama-fast", true], f).run();
    expect(r.stdout).toContain("different provider");
    expect(await a.read("speeq.config.ts")).toContain("https://api.groq.com/openai/v1");
    expect(await a.read(".speeq/backups/speeq.config.before-connect.ts")).toBe(config);
  });
  it("leaves the config alone when the answer is no", async () => {
    const config = `import { createGeminiProvider } from "speeq/llm-gemini";\nexport const x = { llm: createGeminiProvider({ apiKey: "" }) };\n`;
    const a = await project({ "speeq.config.ts": config });
    const { f } = fake(groqRoutes);
    await tty(a, [KEY, "llama-fast", false], f).run();
    expect(await a.read("speeq.config.ts")).toBe(config);
  });
  it("needs a terminal, so a script or --json run exits with a usage error and calls nothing", async () => {
    const a = await project();
    const { f, calls } = fake(groqRoutes);
    const r = await a.cli(["connect", "--json"], { fetch: f });
    expect(r.code).toBe(2);
    expect(calls).toHaveLength(0);
  });
  it("switching from mock updates setup.json and points at upgrade", async () => {
    const a = await project();
    await a.write(
      ".speeq/setup.json",
      JSON.stringify({
        setupVersion: 1,
        provider: "mock",
        voice: "browser",
        languages: ["en-IN"],
        ui: true,
        env: true,
      }),
    );
    const { f } = fake(groqRoutes);
    const r = await tty(a, [KEY, "llama-fast"], f).run(["connect", "--provider", "groq"]);
    expect(JSON.parse(await a.read(".speeq/setup.json")).provider).toBe("groq");
    expect(r.stdout).toContain("speeq upgrade");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  checkKey,
  checkSarvam,
  silentWav,
  testModel,
  testModels,
  testSarvamVoice,
  testStt,
} from "../src/probe.js";
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

describe("busy models, Sarvam and speech-to-text probes", () => {
  it("overload is `busy`, a timeout is `busy`, a quota is `limited`, a retired model is `failed`", async () => {
    const { f } = fake((c) => {
      const model = (JSON.parse(c.body) as { model: string }).model;
      if (model === "overloaded") return json({ error: { message: "high demand right now" } }, 503);
      if (model === "retired")
        return json({ error: { message: "This model is no longer available to new users." } }, 404);
      if (model === "quota") return json({}, 429);
      return json({ choices: [] });
    });
    const r = await testModels({ provider: "groq", key: KEY, fetch: f }, [
      "ok",
      "overloaded",
      "retired",
      "quota",
    ]);
    expect(r.map((x) => x.status)).toEqual(["working", "busy", "failed", "limited"]);
  });
  it("Sarvam: a bad key is rejected, a good key gets a plain 400 and no credits are used", async () => {
    const { f, calls } = fake((c) => {
      if (c.headers["api-subscription-key"] !== "sk_good")
        return json({ code: "invalid_api_key_error" }, 403);
      return JSON.parse(c.body).text === ""
        ? json({ code: "invalid_request_error" }, 400)
        : json({ audios: ["UklGRg=="] });
    });
    expect(await checkSarvam("sk_bad", f)).toMatchObject({ ok: false, kind: "rejected" });
    expect(await checkSarvam("sk_good", f)).toEqual({ ok: true });
    expect(calls.every((c) => JSON.parse(c.body).text === "")).toBe(true);
    expect((await testSarvamVoice("sk_good", f)).ok).toBe(true);
    expect(calls.every((c) => new URL(c.url).host === "api.sarvam.ai")).toBe(true);
  });
  it("speech-to-text: Groq gets a multipart WAV, Gemini gets inline audio, keys stay in headers", async () => {
    const { f, calls } = fake((c) => {
      if (c.url.endsWith("/audio/transcriptions")) return json({ text: "" });
      return json({ candidates: [] });
    });
    const g = await testStt({ provider: "groq", key: KEY, fetch: f }, "whisper-large-v3-turbo");
    const m = await testStt({ provider: "gemini", key: "AQ.key", fetch: f }, "gemini-flash");
    expect([g.status, m.status]).toEqual(["working", "working"]);
    expect(calls.every((c) => !c.url.includes(KEY) && !c.url.includes("AQ.key"))).toBe(true);
    expect(calls[1]?.body).toContain("inlineData");
    expect(silentWav().length).toBe(44 + 16000);
  });
  it("lists Groq's Whisper models separately from chat models", async () => {
    const { f } = fake(groqRoutes);
    const r = await checkKey({ provider: "groq", key: KEY, fetch: f });
    expect(r.ok && r.stt).toEqual(["whisper-large-v3"]);
  });
});

describe("speeq setup", () => {
  const made: Awaited<ReturnType<typeof app>>[] = [];
  afterEach(async () => {
    for (const a of made.splice(0)) await a.cleanup();
  });
  const SETUP = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      setupVersion: 1,
      provider: "groq",
      voice: "browser",
      languages: ["en-IN"],
      ui: true,
      env: true,
      ...over,
    });
  async function project(extra: Record<string, string> = {}, setup = SETUP()) {
    const a = await app("next-app-minimal");
    made.push(a);
    await a.write(".gitignore", "node_modules\n");
    await a.write(".speeq/setup.json", setup);
    for (const [file, text] of Object.entries(extra)) await a.write(file, text);
    return a;
  }
  const tty = (a: Awaited<ReturnType<typeof app>>, answers: unknown[], f: typeof fetch) => {
    const prompts = scripted(answers);
    return {
      prompts,
      run: (args: string[] = ["setup"]) => a.cli(args, { isTTY: true, prompts, fetch: f }),
    };
  };

  it("changes the model: checks the key, lists models, saves key and model, never prints the key", async () => {
    const a = await project({
      ".env.local": "SPEEQ_SECRET=abc\nGROQ_API_KEY=\nSPEEQ_LLM_MODEL=\n",
    });
    const { f } = fake(groqRoutes);
    const { prompts, run } = tty(a, ["model", "groq", "paste", KEY, "llama-fast", "apply"], f);
    const r = await run();
    expect(r.code).toBe(0);
    const env = await a.read(".env.local");
    expect(env).toContain(`GROQ_API_KEY=${KEY}`);
    expect(env).toContain("SPEEQ_LLM_MODEL=llama-fast");
    expect(env).toContain("SPEEQ_SECRET=abc");
    expect(r.stdout + r.stderr).not.toContain(KEY);
    expect(r.stdout).toContain("llama-fast");
    expect(r.stdout).toContain("limited-one");
    expect(r.stdout).toContain("broken-one");
    expect(prompts.asked[0]).toBe("What next?");
    expect(await a.read(".gitignore")).toContain(".env*.local");
  });
  it("a rejected key is not saved, and the developer can try again", async () => {
    const a = await project();
    const { f } = fake(groqRoutes);
    const r = await tty(
      a,
      ["model", "groq", "paste", "gsk_wrong", "paste", KEY, "llama-fast", "apply"],
      f,
    ).run();
    expect(r.stdout).toContain("rejected");
    expect(r.stdout).not.toContain("gsk_wrong");
    expect(await a.read(".env.local")).toContain(`GROQ_API_KEY=${KEY}`);
  });
  it("skipping the key writes nothing", async () => {
    const a = await project();
    const { f, calls } = fake(groqRoutes);
    const before = await a.snapshot();
    const r = await tty(a, ["model", "groq", "__skip", "apply"], f).run();
    expect(r.code).toBe(0);
    expect(calls).toHaveLength(0);
    expect(await a.snapshot()).toEqual(before);
  });
  it("offers the key that is already in .env.local, checks it, and only adds the model", async () => {
    const a = await project({ ".env.local": `GROQ_API_KEY=${KEY}\n` });
    const { f } = fake(groqRoutes);
    const { prompts, run } = tty(a, ["model", "groq", "use", "llama-fast", "apply"], f);
    const r = await run();
    expect(prompts.asked).toContain("Your Groq key");
    const env = await a.read(".env.local");
    expect(env).toContain(`GROQ_API_KEY=${KEY}`);
    expect(env).toContain("SPEEQ_LLM_MODEL=llama-fast");
    expect(env.match(/GROQ_API_KEY/g)?.length).toBe(1);
    expect(r.stdout + r.stderr).not.toContain(KEY);
  });
  it("asks before replacing a different value, and keeps the old one on no", async () => {
    const a = await project({ ".env.local": "GROQ_API_KEY=existing\n" });
    const { f } = fake(groqRoutes);
    const { prompts, run } = tty(
      a,
      ["model", "groq", "paste", KEY, "llama-fast", "apply", false],
      f,
    );
    await run();
    expect(prompts.asked.some((m) => /different value/.test(m))).toBe(true);
    expect(await a.read(".env.local")).toContain("GROQ_API_KEY=existing");
  });
  it("switches a config that still uses another provider, with a backup copy", async () => {
    const config = `import { createSpeeq } from "speeq/server";
import { createGeminiProvider } from "speeq/llm-gemini";
export const speeq = createSpeeq({
  llm: createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY ?? "", model: process.env.SPEEQ_LLM_MODEL ?? "" }),
});
`;
    const a = await project({ "speeq.config.ts": config });
    const { f } = fake(groqRoutes);
    const r = await tty(a, ["model", "groq", "paste", KEY, "llama-fast", "apply", true], f).run();
    expect(r.stdout).toContain("Updated speeq.config.ts");
    expect(await a.read("speeq.config.ts")).toContain("https://api.groq.com/openai/v1");
    expect(await a.read(".speeq/backups/speeq.config.before-setup.ts")).toBe(config);
  });
  it("leaves the config alone when the answer is no", async () => {
    const config = `import { createGeminiProvider } from "speeq/llm-gemini";\nexport const speeq = createSpeeq({ llm: createGeminiProvider({ apiKey: "" }) });\n`;
    const a = await project({ "speeq.config.ts": config });
    const { f } = fake(groqRoutes);
    await tty(a, ["model", "groq", "paste", KEY, "llama-fast", "apply", false], f).run();
    expect(await a.read("speeq.config.ts")).toBe(config);
  });
  it("Sarvam voice: checks the key without credits, speaks a test, saves the key, switches the config", async () => {
    const config = `import { createSpeeq } from "speeq/server";
export const speeq = createSpeeq({
  llm: makeLlm(),
  store: 1,
});
`;
    const a = await project({ "speeq.config.ts": config });
    const SARVAM_KEY = "sk_sarvam_test_1234567890";
    const { f, calls } = fake((c) => {
      if (c.headers["api-subscription-key"] !== SARVAM_KEY) return json({}, 403);
      return JSON.parse(c.body).text === "" ? json({}, 400) : json({ audios: ["UklGRg=="] });
    });
    const { run } = tty(a, ["voice", "sarvam", "paste", SARVAM_KEY, true, "apply", true, true], f);
    const r = await run();
    expect(r.stdout).toContain("Sarvam voice works");
    expect(r.stdout + r.stderr).not.toContain(SARVAM_KEY);
    expect(await a.read(".env.local")).toContain(`SARVAM_API_KEY=${SARVAM_KEY}`);
    expect(await a.read("speeq.config.ts")).toContain("createSarvamStt");
    expect(JSON.parse(await a.read(".speeq/setup.json")).voice).toBe("sarvam");
    expect(calls.filter((c) => JSON.parse(c.body).text !== "")).toHaveLength(1); // the one spoken test
  });
  it("needs a terminal, so a script or --json run exits with a usage error and calls nothing", async () => {
    const a = await project();
    const { f, calls } = fake(groqRoutes);
    expect((await a.cli(["setup", "--json"], { fetch: f })).code).toBe(2);
    expect((await a.cli(["connect"], { fetch: f })).code).toBe(2);
    expect(calls).toHaveLength(0);
  });
  it("Cancel writes nothing", async () => {
    const a = await project();
    const before = await a.snapshot();
    const { f } = fake(groqRoutes);
    const r = await tty(a, ["cancel"], f).run();
    expect(r.code).toBe(0);
    expect(await a.snapshot()).toEqual(before);
  });
  it("refuses in a folder where speeq was never set up", async () => {
    const a = await app("next-app-minimal");
    made.push(a);
    const { f } = fake(groqRoutes);
    const r = await a.cli(["setup"], { isTTY: true, prompts: scripted([]), fetch: f });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("npx speeq init");
  });
});

describe("speeq remove", () => {
  const made: Awaited<ReturnType<typeof app>>[] = [];
  afterEach(async () => {
    for (const a of made.splice(0)) await a.cleanup();
  });
  const LAYOUT = `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
`;
  async function installed() {
    const a = await app("next-app-minimal");
    made.push(a);
    await a.write("app/layout.tsx", LAYOUT);
    await a.write(".env.local", "KEEP_ME=1\nGROQ_API_KEY=gsk_user_key\n");
    const before = await a.snapshot();
    await a.cli(["init", "--provider", "groq"]);
    return { a, before };
  }
  it("removes everything speeq added and nothing else", async () => {
    const { a, before } = await installed();
    expect(await a.read("components/speeq/assistant.tsx")).toContain("SpeeqProvider");
    const r = await a.cli(["remove", "--yes", "--json"]);
    expect(r.code).toBe(0);
    const after = await a.snapshot();
    expect(after["app/layout.tsx"]).toBe(LAYOUT);
    expect(Object.keys(after).filter((f) => /speeq/i.test(f) && f !== ".gitignore")).toEqual([]);
    // the app's own variables, and its provider key, stay; speeq's names are gone
    expect(after[".env.local"]).toContain("KEEP_ME=1");
    expect(after[".env.local"]).toContain("GROQ_API_KEY=gsk_user_key");
    expect(after[".env.local"]).not.toContain("SPEEQ_");
    expect(Object.keys(after).sort()).toEqual(
      Object.keys(before)
        .filter((f) => f !== ".env.example")
        .concat(
          Object.keys(after).includes(".gitignore") && !before[".gitignore"] ? [".gitignore"] : [],
        )
        .sort(),
    );
  });
  it("--dry-run lists and changes nothing; without --yes or a terminal it refuses", async () => {
    const { a } = await installed();
    const snap = await a.snapshot();
    expect((await a.cli(["remove", "--dry-run"])).code).toBe(0);
    expect(await a.snapshot()).toEqual(snap);
    const refused = await a.cli(["remove"]);
    expect(refused.code).toBe(2);
    expect(await a.snapshot()).toEqual(snap);
  });
  it("a second remove finds nothing to do", async () => {
    const { a } = await installed();
    await a.cli(["remove", "--yes"]);
    const again = await a.cli(["remove", "--yes"]);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("Nothing to remove");
  });
  it("keeps a generated file you edited unless you choose it, and removes it when chosen", async () => {
    const { a } = await installed();
    const file = "components/speeq/assistant.tsx";
    await a.write(file, `${await a.read(file)}\n// my own change\n`);
    await a.cli(["remove", "--yes"]);
    expect(await a.read(file)).toContain("my own change");
    const prompts = scripted([["files", "layout", "config", "dir", "env", "edited"], true]);
    await a.cli(["remove"], { isTTY: true, prompts });
    await expect(a.read(file)).rejects.toThrow();
  });
  it("in a terminal, provider keys are only removed when chosen", async () => {
    const { a } = await installed();
    const prompts = scripted([["files", "layout", "config", "dir", "env", "keys"], true]);
    const r = await a.cli(["remove"], { isTTY: true, prompts });
    expect(r.code).toBe(0);
    const env = await a.read(".env.local");
    expect(env).toContain("KEEP_ME=1");
    expect(env).not.toContain("GROQ_API_KEY");
  });
  it("answering no removes nothing", async () => {
    const { a } = await installed();
    const snap = await a.snapshot();
    const prompts = scripted([["files", "layout", "config", "dir", "env"], false]);
    await a.cli(["remove"], { isTTY: true, prompts });
    expect(await a.snapshot()).toEqual(snap);
  });
  it("uninstalls the package only after a yes, with the project's package manager", async () => {
    const { a } = await installed();
    await a.write(
      "package.json",
      JSON.stringify({ name: "x", dependencies: { speeq: "^1", zod: "^4" } }),
    );
    await a.write("pnpm-lock.yaml", "lockfileVersion: 9\n");
    const calls: string[][] = [];
    const prompts = scripted([["files", "layout", "config", "dir", "env", "pkg"], true]);
    await a.cli(["remove"], {
      isTTY: true,
      prompts,
      exec: async (cmd, args) => {
        calls.push([cmd, ...args]);
        return 0;
      },
    });
    expect(calls).toEqual([["pnpm", "remove", "speeq"]]);
  });
});

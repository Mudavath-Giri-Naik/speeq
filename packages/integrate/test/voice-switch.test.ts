import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  configStoreState,
  configVoiceState,
  keepStoreAcrossReloads,
  renderAssistant,
  switchVoice,
  VOICES,
} from "../src/index.js";
import { project } from "./helpers.js";

const voice = (id: string) => {
  const v = VOICES.find((x) => x.id === id);
  if (!v) throw new Error(id);
  return v;
};

const BASE = `import { createSpeeq } from "speeq/server";
import { createMemoryStore } from "speeq/store-memory";

export const speeq = createSpeeq({
  secret: process.env.SPEEQ_SECRET,
  llm: makeLlm({ a: 1 }),
  store: createMemoryStore(),
});
`;
const WITH_CLOUD = `import { createSpeeq } from "speeq/server";
import { createSpeechConfig } from "speeq/server";

export const speeq = createSpeeq({
  llm: makeLlm({ a: 1 }),
  // Falls back to browser voice until all four variables are set.
  speech:
    process.env.GROQ_API_KEY && process.env.GEMINI_API_KEY
      ? createSpeechConfig({ profile: "free-cloud", groqApiKey: process.env.GROQ_API_KEY, geminiApiKey: "it's, fine" })
      : undefined,
  store: 1,
});
`;

describe("switching the speech setting in speeq.config.ts", () => {
  it("adds a Sarvam block after llm, and the import", () => {
    const r = switchVoice(BASE, voice("sarvam"));
    if ("reason" in r) throw new Error(r.reason);
    expect(r.text).toContain('import { createSarvamStt, createSarvamTts } from "speeq/speech";');
    expect(r.text).toContain("createSarvamStt({ apiKey: process.env.SARVAM_API_KEY })");
    expect(r.text).toContain("allowPaid: true");
    expect(r.text.indexOf("speech:")).toBeGreaterThan(r.text.indexOf("llm:"));
    expect(r.text.indexOf("speech:")).toBeLessThan(r.text.indexOf("store:"));
    expect(configVoiceState(r.text, voice("sarvam"))).toBe("match");
    expect(configVoiceState(r.text, voice("browser"))).toBe("mismatch");
  });
  it("replaces an existing cloud block, even with an apostrophe and commas inside strings", () => {
    const r = switchVoice(WITH_CLOUD, voice("sarvam"));
    if ("reason" in r) throw new Error(r.reason);
    expect(r.text).not.toContain("createSpeechConfig");
    expect(r.text).not.toContain("Falls back to browser voice until all four");
    expect(r.text).toContain("store: 1,");
    expect(r.text).toContain("llm: makeLlm({ a: 1 }),");
  });
  it("removes the property for browser voice and drops the unused import", () => {
    const sarvam = switchVoice(BASE, voice("sarvam"));
    if ("reason" in sarvam) throw new Error(sarvam.reason);
    const back = switchVoice(sarvam.text, voice("browser"));
    if ("reason" in back) throw new Error(back.reason);
    expect(back.text).toBe(BASE);
  });
  it("switching to cloud from Sarvam keeps one speech property", () => {
    const sarvam = switchVoice(BASE, voice("sarvam"));
    if ("reason" in sarvam) throw new Error(sarvam.reason);
    const cloud = switchVoice(sarvam.text, voice("cloud"));
    if ("reason" in cloud) throw new Error(cloud.reason);
    expect(cloud.text.match(/speech:/g)?.length).toBe(1);
    expect(cloud.text).toContain("createSpeechConfig");
    expect(cloud.text).not.toContain("createSarvam");
  });
  it("gives a reason when there is no createSpeeq call", () => {
    expect("reason" in switchVoice("export default {};\n", voice("sarvam"))).toBe(true);
  });
  it("a generated config for Sarvam already matches", async () => {
    const p = await project("next-app-minimal");
    try {
      const plan = await p.plan(undefined, { providerId: "groq", voice: "sarvam", env: true });
      const config = plan.changes.find((c) => c.path === "speeq.config.ts")?.content ?? "";
      expect(config).toContain("createSarvamStt");
      expect(configVoiceState(config, voice("sarvam"))).toBe("match");
      const env = plan.changes.find((c) => c.path === ".env.local");
      expect(env?.content ?? "").toContain("SARVAM_API_KEY=");
    } finally {
      await p.cleanup();
    }
  });
});

describe("the generated chat box", () => {
  const widget = renderAssistant({
    voice: "browser",
    languages: ["en-IN"],
    mock: false,
    name: "Helper",
    suggestions: ["Open Pricing", 'Open "Docs"'],
  });
  it("navigates with the router, but only to paths on this site", () => {
    expect(widget).toContain('import { useRouter } from "next/navigation";');
    expect(widget).toContain("onNavigate={(action) => {");
    expect(widget).toContain("router.push(action.href)");
    expect(widget).toContain('href.startsWith("/") && !href.startsWith("//")');
    expect(widget).toContain("String.fromCharCode(92)");
  });
  it("starts the conversation with a greeting and tappable suggestions", () => {
    expect(widget).toContain('const SUGGESTIONS: string[] = ["Open Pricing","Open \\"Docs\\""];');
    expect(widget).toContain("What are you after?");

    expect(widget).toContain("chat.sendText(s.prompt)");
  });
  it("uses the server greeting and starters when the app configures them", () => {
    expect(widget).toContain("greeting?.text || hello");
    expect(widget).toContain("greeting.starters");
    expect(widget).toContain("chat.refreshIdentity()");
    expect(widget).toContain("chat.newConversation()");
    expect(widget).toContain("this is a fresh conversation");
  });
  it("scrolls to the newest message and keeps the log scrollable", () => {
    expect(widget).toContain("el.scrollTo({ top: el.scrollHeight })");
    expect(widget).toContain("latest?.text");
    expect(widget).toContain(".sq-log{flex:1 1 auto;min-height:0;overflow-y:auto");
    expect(widget).toContain("sq-typing");
    expect(widget).toContain("getContext={() =>");
  });
  it("is syntactically valid", () => {
    const out = ts.transpileModule(widget.replace(/^\/\/.*\n/, ""), {
      reportDiagnostics: true,
      fileName: "assistant.tsx",
      compilerOptions: { jsx: ts.JsxEmit.Preserve },
    });
    expect(out.diagnostics).toEqual([]);
  });
});

describe("keeping the dev store across hot reloads", () => {
  const OLD = `import { createSpeeq } from "speeq/server";
import { createMemoryStore } from "speeq/store-memory";

export const speeq = createSpeeq({
  llm: makeLlm(),
  store: createMemoryStore(),
});
`;
  it("is the default in a generated config", async () => {
    const p = await project("next-app-minimal");
    try {
      const plan = await p.plan(undefined, { providerId: "mock" });
      const config = plan.changes.find((c) => c.path === "speeq.config.ts")?.content ?? "";
      expect(config).toContain("__speeqStore");
      expect(config).toContain("  store,");
      expect(configStoreState(config)).toBe("match");
    } finally {
      await p.cleanup();
    }
  });
  it("rewrites an older config and changes nothing else", () => {
    expect(configStoreState(OLD)).toBe("mismatch");
    const r = keepStoreAcrossReloads(OLD);
    if ("reason" in r) throw new Error(r.reason);
    expect(r.text).toContain("const store = (memory.__speeqStore ??= createMemoryStore());");
    expect(r.text).toContain("  store,");
    expect(r.text).toContain("llm: makeLlm(),");
    expect(r.text.indexOf("const store")).toBeLessThan(r.text.indexOf("export const speeq"));
    expect(configStoreState(r.text)).toBe("match");
    const again = keepStoreAcrossReloads(r.text);
    expect("reason" in again ? "" : again.text).toBe(r.text);
  });
  it("leaves other stores alone", () => {
    const mongo = OLD.replace("createMemoryStore()", "createMongoStore(db)");
    expect(configStoreState(mongo)).toBe("match");
  });
});

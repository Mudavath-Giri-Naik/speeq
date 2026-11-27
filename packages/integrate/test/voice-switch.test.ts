import { describe, expect, it } from "vitest";
import { configVoiceState, switchVoice, VOICES } from "../src/index.js";
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

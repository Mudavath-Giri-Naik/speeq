import { describe, expect, it } from "vitest";
import {
  applyEnvValues,
  configProviderState,
  keyVariable,
  PROVIDERS,
  switchProvider,
} from "../src/index.js";

const provider = (id: string) => {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};

describe("applyEnvValues", () => {
  it("fills empty variables in place and keeps everything else", () => {
    const before = "# mine\nFOO=1\nGROQ_API_KEY=\nSPEEQ_LLM_MODEL=\nBAR=2\n";
    const r = applyEnvValues(before, { GROQ_API_KEY: "gsk_abc", SPEEQ_LLM_MODEL: "m-1" });
    expect(r.text).toBe("# mine\nFOO=1\nGROQ_API_KEY=gsk_abc\nSPEEQ_LLM_MODEL=m-1\nBAR=2\n");
    expect(r.filled).toEqual(["GROQ_API_KEY", "SPEEQ_LLM_MODEL"]);
  });
  it("fills every empty duplicate, so the last one cannot win with an empty value", () => {
    const r = applyEnvValues("GROQ_API_KEY=\nX=1\nGROQ_API_KEY=\n", { GROQ_API_KEY: "k1" });
    expect(r.text).toBe("GROQ_API_KEY=k1\nX=1\nGROQ_API_KEY=k1\n");
  });
  it("never replaces a value that exists unless asked", () => {
    const before = "GROQ_API_KEY=old\n";
    const kept = applyEnvValues(before, { GROQ_API_KEY: "new" });
    expect(kept.text).toBe(before);
    expect(kept.skipped).toEqual(["GROQ_API_KEY"]);
    const replaced = applyEnvValues(
      before,
      { GROQ_API_KEY: "new" },
      { overwrite: ["GROQ_API_KEY"] },
    );
    expect(replaced.text).toBe("GROQ_API_KEY=new\n");
    expect(replaced.replaced).toEqual(["GROQ_API_KEY"]);
  });
  it("appends missing names with a note and keeps CRLF line endings", () => {
    const r = applyEnvValues(
      "A=1\r\n",
      { GROQ_API_KEY: "k" },
      { notes: { GROQ_API_KEY: "Groq key" } },
    );
    expect(r.text).toBe("A=1\r\n\r\n# Groq key\r\nGROQ_API_KEY=k\r\n");
    expect(r.added).toEqual(["GROQ_API_KEY"]);
  });
  it("creates the file text when there is none", () => {
    expect(applyEnvValues(undefined, { SPEEQ_LLM_MODEL: "m" }).text).toBe("SPEEQ_LLM_MODEL=m\n");
  });
  it("treats quoted-empty and comment-only values as empty", () => {
    expect(applyEnvValues('GROQ_API_KEY=""\n', { GROQ_API_KEY: "k" }).filled).toEqual([
      "GROQ_API_KEY",
    ]);
  });
  it("refuses values that could add a line or need quoting, and bad names", () => {
    expect(() => applyEnvValues("", { GROQ_API_KEY: "a\nEVIL=1" })).toThrow();
    expect(() => applyEnvValues("", { GROQ_API_KEY: "a b" })).toThrow();
    expect(() => applyEnvValues("", { GROQ_API_KEY: 'a"b' })).toThrow();
    expect(() => applyEnvValues("", { "bad name": "x" })).toThrow();
  });
  it("is a no-op when nothing changes", () => {
    const before = "A=1\n";
    expect(applyEnvValues(before, {}).text).toBe(before);
  });
});

const GEMINI_CONFIG = `import { createSpeeq } from "speeq/server";
import { createMemoryStore } from "speeq/store-memory";
import { createGeminiProvider } from "speeq/llm-gemini";

export const speeq = createSpeeq({
  secret: process.env.SPEEQ_SECRET,
  llm: createGeminiProvider({
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.SPEEQ_LLM_MODEL ?? "",
  }),
  store: createMemoryStore(),
});
`;

describe("switching the provider in speeq.config.ts", () => {
  it("knows each provider's key variable", () => {
    expect(keyVariable(provider("groq"))).toBe("GROQ_API_KEY");
    expect(keyVariable(provider("gemini"))).toBe("GEMINI_API_KEY");
    expect(keyVariable(provider("mock"))).toBeUndefined();
  });
  it("detects a match and a mismatch", () => {
    expect(configProviderState(GEMINI_CONFIG, provider("gemini"))).toBe("match");
    expect(configProviderState(GEMINI_CONFIG, provider("groq"))).toBe("mismatch");
    expect(configProviderState("export const x = 1;", provider("groq"))).toBe("unknown");
  });
  it("rewrites the llm call and its import, and nothing else", () => {
    const r = switchProvider(GEMINI_CONFIG, provider("groq"));
    if ("reason" in r) throw new Error(r.reason);
    expect(r.text).toContain(
      'import { createOpenAICompatibleProvider } from "speeq/llm-openai-compatible";',
    );
    expect(r.text).not.toContain("createGeminiProvider");
    expect(r.text).toContain("https://api.groq.com/openai/v1");
    expect(r.text).toContain("process.env.GROQ_API_KEY");
    expect(r.text).toContain('import { createMemoryStore } from "speeq/store-memory";');
    expect(r.text).toContain("store: createMemoryStore(),");
    expect(configProviderState(r.text, provider("groq"))).toBe("match");
  });
  it("switching between providers that share a factory keeps the import", () => {
    const groq = switchProvider(GEMINI_CONFIG, provider("groq"));
    if ("reason" in groq) throw new Error(groq.reason);
    const router = switchProvider(groq.text, provider("openrouter"));
    if ("reason" in router) throw new Error(router.reason);
    expect(router.text.match(/createOpenAICompatibleProvider/g)?.length).toBe(2); // import + call
    expect(router.text).toContain("OPENROUTER_API_KEY");
  });
  it("is not fooled by parentheses and quotes inside the call", () => {
    const tricky = GEMINI_CONFIG.replace('?? ""', '?? ")("');
    const r = switchProvider(tricky, provider("groq"));
    if ("reason" in r) throw new Error(r.reason);
    expect(r.text).toContain("store: createMemoryStore(),");
  });
  it("gives a reason and leaves the text alone when the shape is unexpected", () => {
    const r = switchProvider("export default {};\n", provider("groq"));
    expect("reason" in r).toBe(true);
    const shared = GEMINI_CONFIG.replace(
      'import { createGeminiProvider } from "speeq/llm-gemini";',
      'import { createGeminiProvider, other } from "speeq/llm-gemini";',
    );
    expect("reason" in switchProvider(shared, provider("groq"))).toBe(true);
  });
});

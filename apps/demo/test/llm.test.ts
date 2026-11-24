import { expect, it, vi } from "vitest";
import { getLlmMode, selectLlm } from "../lib/llm";

const groq = "groq-test-value";
const gemini = "gemini-test-value";
const keys = { GROQ_API_KEY: groq, GEMINI_API_KEY: gemini };

it.each([
  [{}, "mock", "mock"],
  [{ ...keys }, "groq", "openai-compatible"],
  [{ ...keys, SPEEQ_LLM: "unknown" }, "groq", "openai-compatible"],
  [{ GROQ_API_KEY: groq }, "groq", "openai-compatible"],
  [{ GEMINI_API_KEY: gemini }, "gemini", "gemini"],
  [{ ...keys, SPEEQ_LLM: " mock " }, "mock", "mock"],
  [{ ...keys, SPEEQ_LLM: " groq " }, "groq", "openai-compatible"],
  [{ ...keys, SPEEQ_LLM: " gemini " }, "gemini", "gemini"],
  [{ GROQ_API_KEY: "  ", GEMINI_API_KEY: gemini }, "gemini", "gemini"],
  [{ SPEEQ_LLM: " ", GROQ_API_KEY: " ", GEMINI_API_KEY: " " }, "mock", "mock"],
] as const)("selects the expected provider for case %#", (env, mode, kind) => {
  const selected = selectLlm(env, 0);
  expect(getLlmMode(env)).toBe(mode);
  expect(selected.mode).toBe(mode);
  expect(selected.provider.kind).toBe(kind);
});

it.each([
  ["groq", { GEMINI_API_KEY: gemini, GROQ_API_KEY: " " }],
  ["gemini", { GROQ_API_KEY: groq }],
] as const)("warns and uses mock when the explicitly selected %s is unavailable", (mode, env) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const selected = selectLlm({ ...env, SPEEQ_LLM: mode }, 0);
    expect(selected.mode).toBe("mock");
    expect(selected.provider.kind).toBe("mock");
    expect(warn).toHaveBeenCalledExactlyOnceWith(`[demo] ${mode} has no API key. Using mock mode.`);
  } finally {
    warn.mockRestore();
  }
});

it("trims model overrides and uses the specified model defaults", () => {
  expect(selectLlm({ GROQ_API_KEY: groq, GROQ_MODEL: " " }).provider.model).toBe(
    "llama-3.3-70b-versatile",
  );
  expect(selectLlm({ GEMINI_API_KEY: gemini }).provider.model).toBe("gemini-3.8-flash");
  expect(selectLlm({ GROQ_API_KEY: groq, GROQ_MODEL: " custom-model " }).provider.model).toBe(
    "custom-model",
  );
  expect(selectLlm({ GEMINI_API_KEY: gemini, GEMINI_MODEL: " custom-model " }).provider.model).toBe(
    "custom-model",
  );
});

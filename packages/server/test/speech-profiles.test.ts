import { FakeSttProvider } from "@speeq/testing";
import { expect, it } from "vitest";
import { createSpeechConfig } from "../src/index.js";

it("profiles only enable explicitly configured, unpaid providers", () => {
  expect(createSpeechConfig({ profile: "browser" })).toBeUndefined();
  const o = {
    profile: "free-cloud" as const,
    groqApiKey: "g",
    geminiApiKey: "k",
    sttModels: { groq: "g", gemini: "m" },
  };
  expect(() => createSpeechConfig({ ...o, groqApiKey: "" })).toThrow();
  for (const p of [
    createSpeechConfig(o),
    createSpeechConfig({
      profile: "self-hosted-indic",
      sttBaseURL: "http://localhost:1/v1",
      ttsBaseURL: "http://localhost:2/v1",
    }),
  ]) {
    expect(p?.policy ?? {}).not.toHaveProperty("allowPaid", true);
    expect([...(p?.stt ?? []), ...(p?.tts ?? [])].some((i) => i.kind === "remote-paid")).toBe(
      false,
    );
  }
  expect(() =>
    createSpeechConfig({
      profile: "self-hosted-indic",
      languageMode: "auto",
      detector: new FakeSttProvider([], { kind: "remote-paid" }),
      sttBaseURL: "a",
      ttsBaseURL: "b",
    }),
  ).toThrow();
});

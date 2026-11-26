import { FakeSpeechInput } from "@speeq/testing";
import { expect, it, vi } from "vitest";
import { createSpeeqClient } from "../src/client.js";
import { LanguageMode } from "../src/language-mode.js";
import { ServerSpeechInput } from "../src/server-speech-input.js";

const candidates = ["en-IN", "hi-IN", "te-IN"];
it("switches on sustained evidence, honors overrides and constrains unknown tags", () => {
  const mode = new LanguageMode(true);
  const see = (text: string, lang?: string, confidence?: number) =>
    mode.observe(text, candidates, "en-IN", lang, confidence);
  expect(see("hi", "en", 1)).toBe("en-IN");
  expect(see("తెలుగు", "te", 0.4)).toBe("en-IN");
  expect(see("తెలుగు", "te", 0.4)).toBe("te-IN");
  expect(see("हाँ", "hi", 0.9)).toBe("hi-IN");
  expect(see("hello", "de", 1)).toBe("en-IN");
  mode.set("hi-IN");
  expect(see("తెలుగు", "te", 1)).toBe("hi-IN");
  mode.set("auto");
  expect(see("తెలుగు")).toBe("te-IN");
});
function setup(
  input: FakeSpeechInput | ServerSpeechInput,
  auto = true,
  override?: (s: string) => string,
) {
  const turns: Record<string, unknown>[] = [];
  const config = {
    agentName: "test",
    defaultLanguage: "en-IN",
    languages: candidates,
    features: { audit: false, knowledge: false, tools: false, navigation: false },
    routes: [],
    speech: { stt: true, tts: false, detectsLanguage: true },
  };
  const client = createSpeeqClient({
    endpoint: "/api",
    languageMode: auto ? "auto" : "fixed",
    preferredLanguages: candidates,
    language: "en-IN",
    languages: candidates,
    call: { correct: override, voiceDetection: false },
    speech: { input, output: null },
    vocabulary: { terms: [{ term: "Brand", aliases: ["brant"] }] },
    fetch: async (url, init) => {
      if (String(url).endsWith("/session"))
        return Response.json({
          sessionId: "s",
          sessionToken: "token",
          expiresAt: new Date(Date.now() + 1000000).toISOString(),
          config,
        });
      turns.push(JSON.parse(String(init?.body)));
      return new Response(null);
    },
  });
  return { client, turns };
}
it("keeps local raw text and suggests a browser language without changing it", async () => {
  const input = new FakeSpeechInput();
  const { client, turns } = setup(input);
  const suggest = vi.fn();
  client.on("languageSuggestion", suggest);
  client.startListening();
  input.say("తెలుగులో మాట్లాడండి brant");
  await vi.waitFor(() => expect(turns).toHaveLength(1));
  expect(turns[0]).toMatchObject({
    inputLanguage: "en-IN",
    language: "en-IN",
    text: "తెలుగులో మాట్లాడండి Brand",
    transcript: { raw: "తెలుగులో మాట్లాడండి brant", corrected: true },
  });
  expect(client.getSnapshot().messages[0]?.rawText).toBe("తెలుగులో మాట్లాడండి brant");
  expect(suggest).toHaveBeenCalledWith(expect.objectContaining({ suggested: "te-IN" }));
  client.destroy();
});
it("explicit correction wins in fixed mode", async () => {
  const input = new FakeSpeechInput();
  const { client, turns } = setup(input, false, () => "custom");
  client.setInputLanguage("hi-IN");
  client.startListening();
  expect(input.starts[0]?.language).toBe("hi-IN");
  input.say("brant");
  await vi.waitFor(() =>
    expect(turns[0]).toMatchObject({
      text: "custom",
      language: "en-IN",
      inputLanguage: "hi-IN",
      transcript: { raw: "brant" },
    }),
  );
  client.destroy();
});
it("omits the language in auto mode and preserves provider ambiguity and confidence", async () => {
  const paths: string[] = [];
  let emit: (s: Float32Array, r: number) => void = () => {};
  const input = new ServerSpeechInput(
    async (path) => {
      paths.push(path);
      return Response.json({
        text: "Brand",
        raw: "brant",
        language: "te",
        confidence: 0.3,
        ambiguous: ["brant"],
        providerId: "fake",
      });
    },
    75,
    async (frame) => {
      emit = frame;
    },
  );
  const { client, turns } = setup(input);
  client.startListening();
  for (let i = 0; i < 16; i++) emit(new Float32Array(640).fill(i < 10 ? 0.2 : 0), 16000);
  await vi.waitFor(() => expect(turns).toHaveLength(1));
  expect(paths[0]).not.toContain("language=");
  expect(turns[0]).toMatchObject({
    inputLanguage: "te-IN",
    language: "te-IN",
    transcript: { raw: "brant", confidence: 0.3, ambiguous: ["brant"] },
  });
  client.destroy();
});
it("retains only an opted-in WAV and drops it on the next speech start or explicit clear", async () => {
  const paths: string[] = [];
  let emit: (s: Float32Array, r: number) => void = () => {};
  const input = new ServerSpeechInput(
    async (path) => {
      paths.push(path);
      return Response.json({ text: "ok" });
    },
    75,
    async (frame) => {
      emit = frame;
    },
  );
  input.keepLastUtterance = true;
  const final = vi.fn();
  input.start({ language: "en", continuous: true }, { onFinal: final });
  const frames = (n: number, level: number) => {
    for (let i = 0; i < n; i++) emit(new Float32Array(640).fill(level), 16000);
  };
  frames(10, 0.2);
  frames(6, 0);
  await vi.waitFor(() => expect(final).toHaveBeenCalledOnce());
  await input.retranscribeLast("hi");
  expect(paths[1]).toContain("language=hi");
  frames(5, 0.3);
  await expect(input.retranscribeLast("hi")).rejects.toMatchObject({ code: "NOT_FOUND" });
  frames(8, 0);
  await vi.waitFor(() => expect(final).toHaveBeenCalledTimes(2));
  input.clearLast();
  await expect(input.retranscribeLast("en")).rejects.toMatchObject({ code: "NOT_FOUND" });
  input.abort();
});

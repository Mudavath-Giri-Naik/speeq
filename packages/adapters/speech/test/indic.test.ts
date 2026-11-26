import { expect, it, vi } from "vitest";
import {
  createDetectThenTranscribe,
  createGeminiStt,
  createSarvamStt,
  createSarvamTts,
} from "../src/index.js";

const req = { audio: Uint8Array.of(1, 2, 3), mimeType: "audio/wav", hints: { prompt: "Brand" } };
it.each(["", "తెలుగు"])("parses Gemini output verbatim", async (text) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ text, language: "te-IN" }) }] } }],
    }),
  );
  const p = createGeminiStt({ model: "gemini-2.5-test", apiKey: "k", fetch });
  expect(await p.transcribe(req)).toMatchObject({ text, language: "te" });
  const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
  expect(body.generationConfig).toMatchObject({
    temperature: 0,
    thinkingConfig: { thinkingBudget: 0 },
    responseMimeType: "application/json",
  });
  expect(body.contents[0].parts[0].inlineData.data).toBe("AQID");
  expect(body.systemInstruction.parts[0].text).toContain("Brand");
});
it.each([200, 429])("maps Gemini failure %i", async (status) => {
  const p = createGeminiStt({
    model: "test",
    apiKey: "k",
    fetch: async () => Response.json({}, { status }),
  });
  await expect(p.transcribe(req)).rejects.toMatchObject({
    code: status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
  });
});
it("restricts detection to candidates and inherits the stricter kind", async () => {
  const detector = createGeminiStt({ apiKey: "k", model: "test" });
  const transcriber = {
    ...detector,
    kind: "remote-paid" as const,
    transcribe: vi.fn(async () => ({ text: "ok", providerMs: 1 })),
  };
  const detect = vi
    .spyOn(detector, "transcribe")
    .mockResolvedValue({ text: "", language: "fr", providerMs: 0 });
  const combined = createDetectThenTranscribe({ detector, transcriber, candidates: ["te", "hi"] });
  expect((await combined.transcribe(req)).language).toBe("te");
  expect(combined.kind).toBe("remote-paid");
  expect(transcriber.transcribe).toHaveBeenCalledWith(expect.objectContaining({ language: "te" }));
  detect.mockRejectedValueOnce(Error());
  await expect(combined.transcribe(req)).rejects.toThrow();
  expect(transcriber.transcribe).toHaveBeenCalledTimes(1);
});
it("uses paid Sarvam contracts and decodes WAV bytes", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
    Response.json(
      String(url).endsWith("speech-to-text")
        ? { transcript: "ok", language_code: "hi-IN" }
        : { audios: ["AQID"] },
    ),
  );
  const o = { model: "test", apiKey: "k", fetch };
  const stt = createSarvamStt(o),
    tts = createSarvamTts(o);
  expect(stt.kind).toBe("remote-paid");
  expect((await stt.transcribe({ ...req, language: "hi" })).language).toBe("hi");
  expect((fetch.mock.calls[0]?.[1]?.body as FormData | undefined)?.get("language_code")).toBe(
    "hi-IN",
  );
  const res = await tts.synthesize({ text: "hi", language: "hi-IN", voiceId: "v" });
  expect([...new Uint8Array(await new Response(res.audio).arrayBuffer())]).toEqual([1, 2, 3]);
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
    language_code: "hi-IN",
    speaker: "v",
  });
});

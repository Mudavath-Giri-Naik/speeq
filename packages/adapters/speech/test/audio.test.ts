import { expect, it, vi } from "vitest";
import { createOpenAICompatibleStt, createOpenAICompatibleTts } from "../src/index.js";

const base = {
  baseURL: "http://localhost/v1/",
  model: "test",
  kind: "self-hosted" as const,
  apiKey: "hidden",
};
it.each([
  ["te-IN", "Telugu", "te"],
  ["en-IN", "English", "en"],
])("posts multipart for %s", async (language, name, code) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ text: "hello", language: name }),
  );
  const p = createOpenAICompatibleStt({ ...base, fetch });
  expect(
    (
      await p.transcribe({
        audio: new Uint8Array(3),
        language,
        mimeType: "audio/wav",
        hints: { prompt: "terms", vocabulary: ["speeq"] },
      })
    ).language,
  ).toBe(code);
  const call = fetch.mock.calls[0];
  expect(call?.[0]).toBe("http://localhost/v1/audio/transcriptions");
  expect(Object.fromEntries(call?.[1]?.body as FormData)).toMatchObject({
    language: code,
    prompt: "terms\nspeeq",
    response_format: "verbose_json",
    temperature: "0",
    model: "test",
  });
});
it.each([429, 500, 200])("sanitizes failed response %i", async (status) => {
  const p = createOpenAICompatibleStt({
    ...base,
    fetch: async () => new Response("hidden", { status, headers: { "retry-after": "3" } }),
  });
  await expect(
    p.transcribe({ audio: new Uint8Array(1), mimeType: "audio/ogg" }),
  ).rejects.toMatchObject(
    status === 429 ? { code: "RATE_LIMITED", retryAfterMs: 3000 } : { code: "PROVIDER_ERROR" },
  );
});
it("rethrows abort and supplies TTS speed, format and ignored parameters", async () => {
  const abort = new DOMException("cancelled", "AbortError");
  const no = createOpenAICompatibleStt({
    ...base,
    fetch: async () => {
      throw abort;
    },
  });
  await expect(no.transcribe({ audio: new Uint8Array(), mimeType: "audio/wav" })).rejects.toBe(
    abort,
  );
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () => new Response(new Uint8Array(4), { headers: { "content-type": "audio/mpeg" } }),
  );
  const t = createOpenAICompatibleTts({ ...base, fetch, voices: [], defaultVoice: "v" });
  expect(await t.synthesize({ text: "hello", language: "en", rate: 2, pitch: 1 })).toMatchObject({
    ignored: ["pitch"],
    mimeType: "audio/mpeg",
  });
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    model: "test",
    input: "hello",
    voice: "v",
    speed: 2,
    response_format: "mp3",
  });
});

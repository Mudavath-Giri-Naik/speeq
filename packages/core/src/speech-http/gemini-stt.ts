import {
  baseLanguage,
  isAbortError,
  type ProviderKind,
  parseRetryAfter,
  SpeeqError,
  type SttProvider,
} from "../index.js";
/** Send a buffered audio request without exposing upstream payloads in errors. */
export async function audioJson(fetcher: typeof fetch, url: string, init: RequestInit) {
  try {
    const r = await fetcher(url, init);
    if (!r.ok) {
      void r.body?.cancel().catch(() => {});
      throw new SpeeqError(r.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR", {
        retryAfterMs: parseRetryAfter(r.headers.get("retry-after")),
      });
    }
    return await r.json();
  } catch (e) {
    if (isAbortError(e) || init.signal?.aborted || e instanceof SpeeqError) throw e;
    throw new SpeeqError("PROVIDER_ERROR");
  }
}
function base64(bytes: Uint8Array) {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 8192)
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(raw);
}
/** Buffered Gemini transcription using structured JSON output. */
export function createGeminiStt(o: {
  id?: string;
  apiKey: string;
  model: string;
  kind?: ProviderKind;
  fetch?: typeof fetch;
}): SttProvider {
  if (!o.apiKey || !o.model || o.kind === "self-hosted") throw new SpeeqError("NOT_CONFIGURED");
  return {
    id: o.id ?? "gemini-stt",
    kind: o.kind ?? "remote-free-tier",
    capabilities: {
      streaming: "buffered",
      detectsLanguage: true,
      vocabulary: "prompt",
      languages: "any",
      maxAudioSeconds: 60,
    },
    async transcribe(req) {
      const started = performance.now();
      const instructions = [
        "Transcribe verbatim. Do not translate, summarise or add words. Keep English words in Latin script and native-language words in their own script. Return empty text for unintelligible audio. Report the primary BCP 47 language tag.",
        req.language ? `Expected speech language: ${req.language}` : "",
        req.hints
          ? `Spell these exactly if spoken: ${[req.hints.prompt, ...(req.hints.vocabulary ?? [])].filter(Boolean).join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      const data = await audioJson(
        o.fetch ?? fetch,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(o.model)}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": o.apiKey, "content-type": "application/json" },
          signal: req.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [
              {
                role: "user",
                parts: [{ inlineData: { mimeType: req.mimeType, data: base64(req.audio) } }],
              },
            ],
            generationConfig: {
              temperature: 0,
              ...(o.model.startsWith("gemini-2.5")
                ? { thinkingConfig: { thinkingBudget: 0 } }
                : {}),
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: { text: { type: "STRING" }, language: { type: "STRING" } },
                required: ["text", "language"],
              },
            },
          }),
        },
      );
      try {
        const value = JSON.parse(
          data.candidates[0].content.parts
            .filter((p: { thought?: boolean }) => !p.thought)
            .map((p: { text: string }) => p.text)
            .join(""),
        );
        if (
          typeof value.text !== "string" ||
          typeof value.language !== "string" ||
          (value.text && !/^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(value.language))
        )
          throw Error();
        return {
          text: value.text,
          language: baseLanguage(value.language) || undefined,
          providerMs: performance.now() - started,
        };
      } catch {
        throw new SpeeqError("PROVIDER_ERROR");
      }
    },
  };
}

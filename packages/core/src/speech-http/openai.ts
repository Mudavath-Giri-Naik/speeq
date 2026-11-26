import {
  type AudioFormat,
  isAbortError,
  type ProviderKind,
  parseRetryAfter,
  SpeeqError,
  type SttProvider,
  type TtsProvider,
  type VoiceInfo,
  type VoiceParam,
} from "../index.js";

interface Options {
  id?: string;
  kind: ProviderKind;
  baseURL: string;
  apiKey?: string;
  model: string;
  fetch?: typeof fetch;
}
async function send(o: Options, path: string, body: BodyInit, signal?: AbortSignal) {
  const headers = new Headers();
  if (o.apiKey) headers.set("authorization", `Bearer ${o.apiKey}`);
  if (typeof body === "string") headers.set("content-type", "application/json");
  let res: Response;
  try {
    res = await (o.fetch ?? fetch)(`${o.baseURL.replace(/\/+$/, "")}/audio/${path}`, {
      method: "POST",
      body,
      headers,
      signal,
    });
  } catch (e) {
    if (signal?.aborted || isAbortError(e)) throw e;
    throw new SpeeqError("PROVIDER_ERROR");
  }
  if (!res.ok) {
    void res.body?.cancel().catch(() => {});
    if (res.status === 429)
      throw new SpeeqError("RATE_LIMITED", {
        retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
      });
    throw new SpeeqError("PROVIDER_ERROR");
  }
  return res;
}
const languages = new Map<string, string>();
function baseLanguage(value: unknown) {
  if (typeof value !== "string" || !value) return;
  if (/^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(value)) return value.split("-")[0]?.toLowerCase();
  if (!languages.size) {
    const names = new Intl.DisplayNames("en", { type: "language", fallback: "none" });
    for (let a = 97; a <= 122; a++)
      for (let b = 97; b <= 122; b++) {
        const code = String.fromCharCode(a, b),
          name = names.of(code);
        if (name && !languages.has(name.toLowerCase())) languages.set(name.toLowerCase(), code);
      }
  }
  return languages.get(value.toLowerCase());
}
/** Recognize one audio upload using the OpenAI-compatible multipart API. */
export function createOpenAICompatibleStt(
  o: Options & { languages?: readonly string[] | "any" },
): SttProvider {
  return {
    id: o.id ?? "openai-compatible-stt",
    kind: o.kind,
    capabilities: {
      streaming: "buffered",
      detectsLanguage: true,
      vocabulary: "prompt",
      languages: o.languages ?? "any",
      maxAudioSeconds: 60,
    },
    async transcribe(req) {
      const body = new FormData();
      const ext = req.mimeType.split("/")[1]?.split(";")[0] ?? "bin";
      body.append(
        "file",
        new Blob([new Uint8Array(req.audio)], { type: req.mimeType }),
        `utterance.${ext}`,
      );
      body.set("model", o.model);
      body.set("response_format", "verbose_json");
      body.set("temperature", "0");
      const language = baseLanguage(req.language);
      if (language) body.set("language", language);
      const prompt = [req.hints?.prompt, req.hints?.vocabulary?.join(", ")]
        .filter(Boolean)
        .join("\n");
      if (prompt) body.set("prompt", prompt);
      const start = performance.now();
      const res = await send(o, "transcriptions", body, req.signal);
      const data = await res.json().catch((e) => {
        if (isAbortError(e)) throw e;
        throw new SpeeqError("PROVIDER_ERROR");
      });
      if (typeof data?.text !== "string") throw new SpeeqError("PROVIDER_ERROR");
      return {
        text: data.text,
        language: baseLanguage(data.language),
        audioMs: typeof data.duration === "number" ? data.duration * 1000 : undefined,
        providerMs: performance.now() - start,
      };
    },
  };
}
/** Synthesize speech using configured voices and the OpenAI-compatible audio API. */
export function createOpenAICompatibleTts(
  o: Options & {
    voices: readonly Omit<VoiceInfo, "provider" | "processing" | "streaming">[];
    defaultVoice?: string;
    format?: AudioFormat;
  },
): TtsProvider {
  const id = o.id ?? "openai-compatible-tts";
  return {
    id,
    kind: o.kind,
    capabilities: {
      streamingAudio: false,
      formats: ["mp3", "wav", "opus", "pcm16"],
      languages: "any",
    },
    async listVoices() {
      return o.voices.map((v) => ({
        ...v,
        provider: id,
        processing: "remote" as const,
        streaming: false,
      }));
    },
    async synthesize(req) {
      const format = req.format ?? o.format ?? "mp3";
      const voice = req.voiceId ?? o.defaultVoice ?? o.voices[0]?.id;
      const res = await send(
        o,
        "speech",
        JSON.stringify({
          model: o.model,
          input: req.text,
          voice,
          response_format: format === "pcm16" ? "pcm" : format,
          speed: req.rate,
        }),
        req.signal,
      );
      if (!res.body) throw new SpeeqError("PROVIDER_ERROR");
      const ignored: VoiceParam[] = (["pitch", "volume", "style"] as const).filter(
        (p) => req[p] !== undefined,
      );
      const unapplied =
        res.headers
          .get("X-Speeq-Ignored")
          ?.split(",")
          .map((p) => p.trim()) ?? [];
      if (req.rate !== undefined && (unapplied.includes("speed") || unapplied.includes("rate")))
        ignored.push("rate");
      return {
        audio: res.body,
        mimeType:
          res.headers.get("content-type") ??
          {
            mp3: "audio/mpeg",
            wav: "audio/wav",
            opus: "audio/ogg",
            pcm16: "application/octet-stream",
          }[format],
        ignored,
      };
    },
  };
}

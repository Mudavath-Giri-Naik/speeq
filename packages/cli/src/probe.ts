/**
 * Checks a developer's own provider key and finds which models work with it. The key goes only to the
 * provider's own API, in a request header, and is never printed, logged or returned. Every message that
 * could echo provider text is scrubbed of the key first.
 */

export type ProbeProvider = "groq" | "gemini" | "openrouter" | "openai-compatible";
type Fetch = typeof fetch;

/** The most models tested in one run. Each test is one tiny message. */
export const MAX_MODELS = 24;
const TIMEOUT_MS = 12_000;
const CONCURRENCY = 6;
const BASES: Record<Exclude<ProbeProvider, "openai-compatible">, string> = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta",
};
// Not chat models: speech, embeddings, safety classifiers, image and video generators, live audio.
const NOT_CHAT =
  /whisper|tts|speech|transcribe|embed|guard|moderat|image|imagen|veo|live|audio|native|aqa|robotics|computer-use|orpheus|rerank|safeguard|lyria|nano-banana/i;

export type KeyCheck =
  | { ok: true; models: string[]; total: number; stt: string[] }
  | { ok: false; kind: "rejected" | "network" | "unexpected"; message: string };
export interface ModelResult {
  model: string;
  /**
   * `working`: answered. `busy`: the provider was overloaded or slow, so it may work later. `limited`: the
   * key is fine but a rate limit or quota answered. `failed`: not usable with this key.
   */
  status: "working" | "busy" | "limited" | "failed";
  ms: number;
  reason?: string;
}
export interface ProbeInput {
  provider: ProbeProvider;
  key: string;
  /** Required for `openai-compatible`; ignored otherwise. */
  baseUrl?: string;
  fetch?: Fetch;
}

/** The API base for a provider, or `undefined` when a custom base URL is not acceptable. */
export function baseFor(provider: ProbeProvider, baseUrl?: string): string | undefined {
  if (provider !== "openai-compatible") return BASES[provider];
  try {
    const u = new URL(baseUrl ?? "");
    const local =
      u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
    if (u.username || u.password || u.search || u.hash) return undefined;
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return undefined;
    return u.href.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
const scrub = (text: string, key: string) =>
  (key ? text.split(key).join("***") : text).replace(/\s+/g, " ").trim().slice(0, 90);
function headers(p: ProbeProvider, key: string): Record<string, string> {
  if (p === "gemini") return { "x-goog-api-key": key, "content-type": "application/json" };
  return { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" };
}
async function call(f: Fetch, url: string, init: RequestInit) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await f(url, { ...init, signal: ctl.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
}
async function errorText(res: Response, key: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } | string };
    const e = body.error;
    const msg = typeof e === "string" ? e : typeof e?.message === "string" ? e.message : "";
    if (msg) return scrub(msg, key);
  } catch {
    // not JSON: fall through
  }
  return `HTTP ${res.status}`;
}
/** Turn a failed model response into a status. Overload is `busy` (try later), quotas are `limited`. */
async function classify(res: Response, key: string): Promise<Omit<ModelResult, "model" | "ms">> {
  if (res.ok) return { status: "working" };
  if (res.status === 429) return { status: "limited", reason: "rate limit or quota reached" };
  const reason = await errorText(res, key);
  if (
    res.status === 503 ||
    res.status === 500 ||
    /high demand|overload|try again later|unavailable/i.test(reason)
  )
    return { status: "busy", reason: "busy right now, try again later" };
  return { status: "failed", reason };
}
/** Newest-looking first: stable names before previews, then higher ids first. */
const order = (a: string, b: string) => {
  const rank = (id: string) =>
    (/preview|exp/i.test(id) ? 2 : 0) + (/flash|instant|fast/i.test(id) ? 0 : 1);
  return rank(a) - rank(b) || b.localeCompare(a);
};

/** Ask the provider whether the key is accepted and which chat models it lists. Sends no message. */
export async function checkKey(input: ProbeInput): Promise<KeyCheck> {
  const f = input.fetch ?? fetch;
  const base = baseFor(input.provider, input.baseUrl);
  if (!base)
    return {
      ok: false,
      kind: "unexpected",
      message:
        "That base URL is not acceptable (use https, or http for localhost, with no credentials).",
    };
  const h = headers(input.provider, input.key);
  try {
    if (input.provider === "openrouter") {
      // The model list is public, so the key is checked on its own.
      const auth = await call(f, `${base}/auth/key`, { headers: h });
      if (auth.status === 401 || auth.status === 403)
        return { ok: false, kind: "rejected", message: "OpenRouter rejected this key." };
      if (!auth.ok)
        return { ok: false, kind: "unexpected", message: await errorText(auth, input.key) };
    }
    const url = input.provider === "gemini" ? `${base}/models?pageSize=1000` : `${base}/models`;
    const res = await call(f, url, { headers: h });
    if (
      res.status === 401 ||
      res.status === 403 ||
      (input.provider === "gemini" && res.status === 400)
    )
      return { ok: false, kind: "rejected", message: "The provider rejected this key." };
    if (!res.ok) return { ok: false, kind: "unexpected", message: await errorText(res, input.key) };
    const body = (await res.json()) as Record<string, unknown>;
    let ids: string[] = [];
    if (input.provider === "gemini") {
      const list = Array.isArray(body.models) ? (body.models as Record<string, unknown>[]) : [];
      ids = list
        .filter(
          (m) =>
            Array.isArray(m.supportedGenerationMethods) &&
            (m.supportedGenerationMethods as unknown[]).includes("generateContent"),
        )
        .map((m) => String(m.name ?? "").replace(/^models\//, ""));
    } else {
      const list = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
      ids = list
        .filter((m) => m.active !== false)
        // OpenRouter lists hundreds of paid models: only free ones are tested, so a test never costs money.
        .filter((m) => input.provider !== "openrouter" || String(m.id).endsWith(":free"))
        .map((m) => String(m.id ?? ""));
    }
    const chat = [...new Set(ids.filter((id) => id && !NOT_CHAT.test(id)))].sort(order);
    const stt = input.provider === "groq" ? ids.filter((id) => /whisper/i.test(id)) : [];
    return { ok: true, models: chat.slice(0, MAX_MODELS), total: chat.length, stt };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      kind: "network",
      message: aborted
        ? `No answer within ${TIMEOUT_MS / 1000}s.`
        : "Could not reach the provider.",
    };
  }
}

/** Send one very short message to a model and report whether it answered. */
export async function testModel(input: ProbeInput, model: string): Promise<ModelResult> {
  const f = input.fetch ?? fetch;
  const base = baseFor(input.provider, input.baseUrl);
  const started = Date.now();
  const done = (r: Omit<ModelResult, "model" | "ms">): ModelResult => ({
    model,
    ms: Date.now() - started,
    ...r,
  });
  if (!base) return done({ status: "failed", reason: "bad base URL" });
  const gemini = input.provider === "gemini";
  const url = gemini
    ? `${base}/models/${encodeURIComponent(model)}:generateContent`
    : `${base}/chat/completions`;
  const body = gemini
    ? {
        contents: [{ role: "user", parts: [{ text: "Reply with: ok" }] }],
        generationConfig: { maxOutputTokens: 16 },
      }
    : { model, messages: [{ role: "user", content: "Reply with: ok" }], max_tokens: 16 };
  try {
    const res = await call(f, url, {
      method: "POST",
      headers: headers(input.provider, input.key),
      body: JSON.stringify(body),
    });
    if (res.ok) return done({ status: "working" });
    return done(await classify(res, input.key));
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return aborted
      ? done({ status: "busy", reason: `slow: no answer in ${TIMEOUT_MS / 1000}s` })
      : done({ status: "failed", reason: "network error" });
  }
}

/** Test many models a few at a time. `onResult` is called as each one finishes. Results keep the input order. */
export async function testModels(
  input: ProbeInput,
  models: readonly string[],
  onResult?: (r: ModelResult) => void,
): Promise<ModelResult[]> {
  const out: ModelResult[] = new Array(models.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      const model = models[i];
      if (model === undefined) return;
      const r = await testModel(input, model);
      out[i] = r;
      onResult?.(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, models.length) }, worker));
  return out;
}

/** The outcome of a key check for a service that has no model list (Sarvam). */
export type ServiceCheck =
  | { ok: true }
  | { ok: false; kind: "rejected" | "network" | "unexpected"; message: string };
export interface VoiceTest {
  ok: boolean;
  ms: number;
  reason?: string;
}
const SARVAM = "https://api.sarvam.ai";

/**
 * Check a Sarvam key without spending credits: Sarvam rejects a bad key (403) before it looks at the
 * request, and a good key with a deliberately empty text gets a plain 400 and no charge.
 */
export async function checkSarvam(key: string, f: Fetch = fetch): Promise<ServiceCheck> {
  try {
    const res = await call(f, `${SARVAM}/text-to-speech`, {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: "", target_language_code: "en-IN" }),
    });
    if (res.status === 403 || res.status === 401)
      return { ok: false, kind: "rejected", message: "Sarvam rejected this key." };
    if (res.status === 400 || res.status === 422) return { ok: true };
    return { ok: false, kind: "unexpected", message: await errorText(res, key) };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      kind: "network",
      message: aborted ? `No answer within ${TIMEOUT_MS / 1000}s.` : "Could not reach Sarvam.",
    };
  }
}
/** Speak two characters with Sarvam (a few characters of the developer's credits) to prove voice works. */
export async function testSarvamVoice(key: string, f: Fetch = fetch): Promise<VoiceTest> {
  const started = Date.now();
  try {
    const res = await call(f, `${SARVAM}/text-to-speech`, {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: "ok",
        target_language_code: "en-IN",
        model: "bulbul:v3",
        speaker: "aditya",
        output_audio_codec: "wav",
      }),
    });
    if (!res.ok) return { ok: false, ms: Date.now() - started, reason: await errorText(res, key) };
    const body = (await res.json()) as { audios?: unknown[] };
    const audio = typeof body.audios?.[0] === "string" ? body.audios[0] : "";
    return audio
      ? { ok: true, ms: Date.now() - started }
      : { ok: false, ms: Date.now() - started, reason: "no audio came back" };
  } catch {
    return { ok: false, ms: Date.now() - started, reason: "no answer from Sarvam" };
  }
}

/** Half a second of silence as a 16 kHz mono WAV, the smallest honest input for a speech-to-text test. */
export function silentWav(): Uint8Array {
  const samples = 8000;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  return bytes;
}

/** Send silence to one speech-to-text model. Groq uses Whisper models; Gemini models accept audio too. */
export async function testStt(input: ProbeInput, model: string): Promise<ModelResult> {
  const f = input.fetch ?? fetch;
  const base = baseFor(input.provider, input.baseUrl);
  const started = Date.now();
  const done = (r: Omit<ModelResult, "model" | "ms">): ModelResult => ({
    model,
    ms: Date.now() - started,
    ...r,
  });
  if (!base || (input.provider !== "groq" && input.provider !== "gemini"))
    return done({ status: "failed", reason: "not a speech provider" });
  try {
    let res: Response;
    if (input.provider === "groq") {
      const form = new FormData();
      form.set("file", new Blob([silentWav() as BlobPart], { type: "audio/wav" }), "silence.wav");
      form.set("model", model);
      res = await call(f, `${base}/audio/transcriptions`, {
        method: "POST",
        headers: { authorization: `Bearer ${input.key}` },
        body: form,
      });
    } else {
      const data = btoa(String.fromCharCode(...silentWav()));
      res = await call(f, `${base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: headers("gemini", input.key),
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: "Transcribe this audio." },
                { inlineData: { mimeType: "audio/wav", data } },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 16 },
        }),
      });
    }
    return done(await classify(res, input.key));
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return aborted
      ? done({ status: "busy", reason: `slow: no answer in ${TIMEOUT_MS / 1000}s` })
      : done({ status: "failed", reason: "network error" });
  }
}

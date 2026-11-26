import {
  type AgentUser,
  SpeeqError,
  SynthesizeRequestSchema,
  TranscribeQuerySchema,
  type TranscribeResponse,
  TranscribeResponseSchema,
  VoicesResponseSchema,
} from "@speeq/core";
import { json, readJson } from "../handler/http.js";
import type { Runtime } from "../runtime.js";
import { clientKey, RateLimiter } from "../security/rate-limit.js";
import { readAudio } from "./limits.js";
import { selectProviders, validateSpeech } from "./policy.js";
import { runChain } from "./router.js";
import { measureWav } from "./wav.js";

/** Create route-local rate buckets and the bounded per-instance replay cache. */
export function speechRoutes(rt: Runtime<AgentUser>) {
  const config = rt.config.raw.speech;
  if (!config) return;
  validateSpeech(config);
  const { stt = [], tts = [], routing, policy, limits = {} } = config;
  const inputs = (lang?: string) => selectProviders(stt, routing?.stt, policy, lang).usable;
  const outputs = (lang?: string) => selectProviders(tts, routing?.tts, policy, lang).usable;
  const timeout = limits.providerTimeoutMs ?? 15000;
  const buckets = {
    transcribe: new RateLimiter(limits.transcribePerMinute ?? 30),
    synthesize: new RateLimiter(limits.synthesizePerMinute ?? 60),
    voices: new RateLimiter(limits.synthesizePerMinute ?? 60),
  };
  const cache = new Map<string, { expires: number; result: Promise<TranscribeResponse> }>();
  return {
    features: {
      detectsLanguage:
        rt.config.languages.some((l) => inputs(l).length) &&
        rt.config.languages.flatMap((l) => inputs(l)).every((p) => p.capabilities.detectsLanguage),
      stt: rt.config.languages.some((l) => inputs(l).length),
      tts: rt.config.languages.some((l) => outputs(l).length),
    },
    async handle(action: string, req: Request, id: string, headers: Record<string, string>) {
      if (action !== "transcribe" && action !== "synthesize" && action !== "voices")
        throw new SpeeqError("NOT_FOUND");
      if (req.method !== (action === "voices" ? "GET" : "POST")) throw new SpeeqError("NOT_FOUND");
      const { user } = await rt.authenticate(req, id);
      const bucket = buckets[action];
      const wait =
        bucket.hit(user ? `u:${user.id}` : `ip:${clientKey(req)}`) ?? bucket.hit(`s:${id}`);
      if (wait !== null) throw new SpeeqError("RATE_LIMITED", { retryAfterMs: wait });
      if (action === "synthesize") {
        const body = await readJson(req, SynthesizeRequestSchema, rt.config.maxRequestBytes);
        if (body.text.length > (limits.maxTtsChars ?? 1000))
          throw new SpeeqError("PAYLOAD_TOO_LARGE");
        const result = await runChain(outputs(body.language), req.signal, timeout, (p, signal) =>
          p.synthesize({ ...body, signal }),
        );
        return new Response(result.audio, {
          headers: {
            ...headers,
            "content-type": result.mimeType,
            "cache-control": "no-store",
            ...(result.ignored.length
              ? {
                  "X-Speeq-Ignored": result.ignored.join(","),
                  "access-control-expose-headers": "X-Speeq-Ignored",
                }
              : {}),
          },
        });
      }
      const query = TranscribeQuerySchema.safeParse(
        Object.fromEntries(new URL(req.url).searchParams),
      );
      if (!query.success) throw new SpeeqError("INVALID_INPUT");
      const { language, utteranceId } = query.data;
      if (action === "voices") {
        const voices = await runChain(outputs(language), req.signal, timeout, (p) =>
          p.listVoices(),
        );
        const parsed = VoicesResponseSchema.safeParse({ voices });
        if (!parsed.success) throw new SpeeqError("PROVIDER_ERROR");
        return json(parsed.data, 200, headers);
      }
      const chain = inputs(language);
      if (!chain.length) throw new SpeeqError("SPEECH_UNAVAILABLE");
      const audio = await readAudio(req, limits.maxAudioBytes ?? 5000000);
      const mimeType = req.headers.get("content-type") ?? "application/octet-stream";
      const key = utteranceId && JSON.stringify([id, utteranceId]);
      const cached = key && cache.get(key);
      if (cached && cached.expires > Date.now()) return json(await cached.result, 200, headers);
      async function transcribe() {
        if (mimeType.split(";")[0]?.trim().toLowerCase() === "audio/wav") {
          const { audioMs, rms } = measureWav(audio);
          if (audioMs < 200) throw new SpeeqError("INVALID_INPUT");
          if (audioMs > (limits.maxAudioSeconds ?? 60) * 1000)
            throw new SpeeqError("PAYLOAD_TOO_LARGE");
          if (rms < 0.003) return { text: "", silent: true };
        }
        return runChain(chain, req.signal, timeout, async (p, signal) => {
          const result = TranscribeResponseSchema.safeParse({
            ...(await p.transcribe({ audio, mimeType, language, signal })),
            providerId: p.id,
          });
          if (!result.success) throw new SpeeqError("PROVIDER_ERROR");
          return result.data;
        });
      }
      const result = transcribe();
      if (key) {
        if (cache.size >= 500) {
          const first = cache.keys().next().value;
          if (first) cache.delete(first);
        }
        cache.set(key, { expires: Date.now() + 120000, result });
      }
      try {
        return json(await result, 200, headers);
      } catch (e) {
        if (key && cache.get(key)?.result === result) cache.delete(key);
        throw e;
      }
    },
  };
}

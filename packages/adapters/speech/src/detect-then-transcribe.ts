import { baseLanguage, SpeeqError, type SttProvider } from "@speeq/core";
/** Detect a candidate language before running a recognizer that requires a language. */
export function createDetectThenTranscribe(o: {
  id?: string;
  detector: SttProvider;
  transcriber: SttProvider;
  candidates: readonly string[];
}): SttProvider {
  const { detector, transcriber, candidates } = o;
  if (!detector.capabilities.detectsLanguage || !candidates.length)
    throw new SpeeqError("NOT_CONFIGURED");
  const kinds = [detector.kind, transcriber.kind];
  return {
    id: o.id ?? "detect-then-transcribe",
    kind: kinds.includes("remote-paid")
      ? "remote-paid"
      : kinds.includes("remote-free-tier")
        ? "remote-free-tier"
        : "self-hosted",
    capabilities: {
      ...transcriber.capabilities,
      detectsLanguage: true,
      streaming: "buffered",
      languages: candidates,
    },
    async transcribe(req) {
      const start = performance.now();
      const detected = req.language ?? (await detector.transcribe(req)).language;
      req.signal?.throwIfAborted();
      const language =
        candidates.find((c) => baseLanguage(c) === baseLanguage(detected ?? "")) ?? candidates[0];
      const result = await transcriber.transcribe({ ...req, language });
      return {
        ...result,
        language: baseLanguage(language ?? ""),
        providerMs: performance.now() - start,
      };
    },
  };
}

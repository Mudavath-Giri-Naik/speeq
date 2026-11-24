/** Version of the HTTP + SSE protocol. Every protocol event carries it. */
export const PROTOCOL_VERSION = 1 as const;

/** Languages supported out of the box (BCP 47 tags). Others can be configured too. */
export const DEFAULT_LANGUAGES = ["en-IN", "te-IN", "hi-IN"] as const;

/** Human-readable names for the default languages, in their own script. */
export const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  "en-IN": "English",
  "te-IN": "తెలుగు",
  "hi-IN": "हिन्दी",
};

/** Version of the telemetry batch format. */
export const TELEMETRY_SCHEMA_VERSION = 1 as const;

/** Latency histogram bucket upper bounds in milliseconds. The last bucket is open-ended. */
export const LATENCY_BUCKETS_MS = [250, 500, 1000, 2000, 4000, 8000, 16000] as const;

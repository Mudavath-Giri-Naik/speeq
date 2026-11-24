import { z } from "zod";
import { LATENCY_BUCKETS_MS, TELEMETRY_SCHEMA_VERSION } from "../constants.js";
import { ErrorCodeSchema, LanguageSchema } from "./common.js";

/*
 * The telemetry contract. These schemas define everything @speeq/server may send to a speeq
 * platform. Every object is strict (unknown keys are rejected) and every string has a pattern or
 * enum, so free text (messages, tool names, URLs, user ids) cannot fit anywhere.
 * Keep `docs/reference/telemetry.md` in sync with this file.
 */

const count = z.number().int().nonnegative().max(1_000_000_000);
const slug = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,39}$/);
const iso = z.iso.datetime();

/** A latency histogram: counts per bucket in {@link LATENCY_BUCKETS_MS}, plus one open bucket. */
export const LatencyHistogramSchema = z
  .array(count)
  .length(LATENCY_BUCKETS_MS.length + 1, "One count per bucket plus the overflow bucket");
/** A latency histogram. */
export type LatencyHistogram = z.infer<typeof LatencyHistogramSchema>;

/** Which speeq features a deployment has turned on. */
export const TelemetryFeaturesSchema = z.strictObject({
  navigation: z.boolean(),
  tools: z.boolean(),
  knowledge: z.boolean(),
  audit: z.boolean(),
  confirmations: z.boolean(),
  /** `ConversationStore.kind`, e.g. `memory` or `mongodb`. */
  store: slug,
  /** `LLMProvider.kind`, e.g. `openai-compatible`, `gemini` or `mock`. */
  llm: slug,
  /** Number of configured languages (not which ones). */
  languageCount: count,
});
/** Which speeq features a deployment has turned on. */
export type TelemetryFeatures = z.infer<typeof TelemetryFeaturesSchema>;

/** Sent once per server instance on first use. */
export const SdkInitEventSchema = z.strictObject({
  type: z.literal("sdk.init"),
  ts: iso,
  /** Versions of installed `@speeq/*` packages. */
  sdkVersions: z
    .record(z.string().regex(/^@speeq\/[a-z0-9-]{1,40}$/), slug)
    .refine((v) => Object.keys(v).length <= 20, "Too many packages"),
  runtime: z.strictObject({
    name: z.enum(["node", "edge", "bun", "deno", "unknown"]),
    version: z.string().regex(/^[0-9a-z.+-]{0,30}$/),
  }),
  framework: z.enum(["nextjs", "unknown"]),
  features: TelemetryFeaturesSchema,
});

/** Counters accumulated since the previous send. */
export const UsageRollupEventSchema = z.strictObject({
  type: z.literal("usage.rollup"),
  ts: iso,
  periodStart: iso,
  periodEnd: iso,
  counters: z.strictObject({
    sessions: count,
    turns: count,
    voiceTurns: count,
    textTurns: count,
    toolCalls: z.strictObject({ builtin: count, custom: count }),
    navigations: count,
    knowledgeSearches: count,
    confirmations: z.strictObject({ requested: count, approved: count, rejected: count }),
    /** Turns per language tag (e.g. `{ "en-IN": 4 }`). Tags only, at most 20 keys. */
    languages: z
      .record(LanguageSchema.max(20), count)
      .refine((v) => Object.keys(v).length <= 20, "Too many languages"),
    latencyMs: z.strictObject({
      total: LatencyHistogramSchema,
      firstToken: LatencyHistogramSchema,
    }),
  }),
});

/** Error counts by stable error code since the previous send. */
export const ErrorRollupEventSchema = z.strictObject({
  type: z.literal("error.rollup"),
  ts: iso,
  periodStart: iso,
  periodEnd: iso,
  errors: z.partialRecord(ErrorCodeSchema, count),
});

/** One telemetry event. */
export const TelemetryEventSchema = z.discriminatedUnion("type", [
  SdkInitEventSchema,
  UsageRollupEventSchema,
  ErrorRollupEventSchema,
]);
/** One telemetry event. */
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
/** Narrows {@link TelemetryEvent} by `type`. */
export type TelemetryEventOf<T extends TelemetryEvent["type"]> = Extract<
  TelemetryEvent,
  { type: T }
>;

/** The body of `POST /api/v1/ingest`. */
export const TelemetryBatchSchema = z.strictObject({
  schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
  /** Random UUID generated per server instance. Not derived from anything. */
  instanceId: z.uuid(),
  /** Optional public project key (`pk_…`) from the platform dashboard. */
  projectKey: z
    .string()
    .regex(/^pk_[A-Za-z0-9]{8,64}$/)
    .optional(),
  sentAt: iso,
  events: z.array(TelemetryEventSchema).min(1).max(50),
});
/** The body of `POST /api/v1/ingest`. */
export type TelemetryBatch = z.infer<typeof TelemetryBatchSchema>;

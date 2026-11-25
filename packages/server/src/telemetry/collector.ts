import {
  ErrorCodeSchema,
  LATENCY_BUCKETS_MS,
  LanguageSchema,
  TELEMETRY_SCHEMA_VERSION,
  TelemetryBatchSchema,
  type TelemetryEvent,
  type TelemetryEventOf,
  type TelemetryFeatures,
  type TelemetryTransport,
} from "@speeq/core";
import { runtimeInfo } from "./runtime-info.js";
import type { TelemetrySink } from "./sink.js";

/** Destination, feature summary and timing for an instance's collector. */
export interface CollectorOptions {
  transport: TelemetryTransport;
  projectKey?: string;
  flushIntervalMs: number;
  features: TelemetryFeatures;
  warn: (message: string) => void;
  now?: () => number;
}

/** Advances any rollup counter up to the schema maximum. */
export function nextCount(value = 0) {
  return Math.min(1_000_000_000, value + 1);
}

function emptyUsage(): TelemetryEventOf<"usage.rollup">["counters"] {
  const histogram = () => Array<number>(LATENCY_BUCKETS_MS.length + 1).fill(0);
  return {
    sessions: 0,
    turns: 0,
    voiceTurns: 0,
    textTurns: 0,
    toolCalls: { builtin: 0, custom: 0 },
    navigations: 0,
    knowledgeSearches: 0,
    confirmations: { requested: 0, approved: 0, rejected: 0 },
    languages: {},
    latencyMs: { total: histogram(), firstToken: histogram() },
  };
}
function observe(histogram: number[], value: number) {
  const bucket = Number.isFinite(value)
    ? LATENCY_BUCKETS_MS.findIndex((bound) => value <= bound)
    : -1;
  const index = bucket < 0 ? LATENCY_BUCKETS_MS.length : bucket;
  histogram[index] = nextCount(histogram[index]);
}

/** Accumulates bounded anonymous counters and sends each snapshot at most once. */
export function createCollector(options: CollectorOptions): TelemetrySink {
  const now = options.now ?? Date.now;
  const instanceId = crypto.randomUUID();
  const init = runtimeInfo();
  let initPending = true,
    inFlight = false,
    warned = false,
    usagePending = false;
  let periodStart: number | undefined;
  let lastSend = -Infinity;
  let usage = emptyUsage();
  let errors: TelemetryEventOf<"error.rollup">["errors"] = {};
  function warn(message: string) {
    if (warned) return;
    warned = true;
    try {
      options.warn(message);
    } catch {
      /* A host logger may throw. */
    }
  }
  function record<Args extends unknown[]>(update: (...args: Args) => void) {
    return (...args: Args) => {
      try {
        update(...args);
        periodStart ??= now();
        usagePending = true;
      } catch {
        /* Telemetry is best effort. */
      }
    };
  }
  async function deliver(batch: unknown) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const parsed = TelemetryBatchSchema.safeParse(batch);
      if (!parsed.success) {
        warn("telemetry batch rejected");
        return;
      }
      const controller = new AbortController();
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("timeout"));
        }, 1500);
      });
      await Promise.race([
        options.transport.send(parsed.data, { signal: controller.signal }),
        deadline,
      ]);
    } catch {
      warn("telemetry send failed");
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
  }
  return {
    session: record(() => {
      usage.sessions = nextCount(usage.sessions);
    }),
    navigation: record(() => {
      usage.navigations = nextCount(usage.navigations);
    }),
    knowledgeSearch: record(() => {
      usage.knowledgeSearches = nextCount(usage.knowledgeSearches);
    }),
    toolCall: record((kind) => {
      const key = kind === "builtin" ? "builtin" : "custom";
      usage.toolCalls[key] = nextCount(usage.toolCalls[key]);
    }),
    confirmation: record((key) => {
      if (!Object.hasOwn(usage.confirmations, key)) throw new Error("invalid outcome");
      usage.confirmations[key] = nextCount(usage.confirmations[key]);
    }),
    turn: record(({ language, inputMode, latencyMs, firstTokenMs }) => {
      usage.turns = nextCount(usage.turns);
      const mode = inputMode === "voice" ? "voiceTurns" : "textTurns";
      usage[mode] = nextCount(usage[mode]);
      if (
        language.length <= 20 &&
        LanguageSchema.safeParse(language).success &&
        (Object.hasOwn(usage.languages, language) || Object.keys(usage.languages).length < 20)
      )
        usage.languages[language] = nextCount(usage.languages[language]);
      observe(usage.latencyMs.total, latencyMs);
      if (firstTokenMs !== undefined) observe(usage.latencyMs.firstToken, firstTokenMs);
    }),
    error(code) {
      try {
        if (ErrorCodeSchema.safeParse(code).success) {
          periodStart ??= now();
          errors[code] = nextCount(errors[code]);
        }
      } catch {
        /* Ignore malformed input. */
      }
    },
    flushIfDue() {
      try {
        if (inFlight || periodStart === undefined) return null;
        const end = now();
        if (!initPending && end - lastSend < options.flushIntervalMs) return null;
        const ts = new Date(end).toISOString();
        const period = { ts, periodStart: new Date(periodStart).toISOString(), periodEnd: ts };
        const events: TelemetryEvent[] = [];
        if (initPending) events.push({ type: "sdk.init", ts, ...init, features: options.features });
        if (usagePending) events.push({ type: "usage.rollup", ...period, counters: usage });
        if (Object.keys(errors).length) events.push({ type: "error.rollup", ...period, errors });
        const key = options.projectKey;
        const batch = {
          schemaVersion: TELEMETRY_SCHEMA_VERSION,
          instanceId,
          sentAt: ts,
          events,
          ...(key && /^pk_[A-Za-z0-9]{8,64}$/.test(key) ? { projectKey: key } : {}),
        };
        // Detach the snapshot before calling any host transport.
        usage = emptyUsage();
        errors = {};
        periodStart = undefined;
        usagePending = false;
        initPending = false;
        lastSend = end;
        inFlight = true;
        return deliver(batch);
      } catch {
        return null;
      }
    },
  };
}

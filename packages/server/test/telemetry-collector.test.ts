import {
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryBatch,
  type TelemetryFeatures,
  type TelemetryTransport,
} from "@speeq/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCollector, nextCount } from "../src/telemetry/collector.js";
import { createHttpTransport } from "../src/telemetry/http-transport.js";
import { createTelemetry } from "../src/telemetry/index.js";
import { noopTelemetry } from "../src/telemetry/sink.js";
import { makeSpeeq } from "./helpers.js";

const features: TelemetryFeatures = {
  navigation: true,
  tools: true,
  knowledge: true,
  audit: false,
  confirmations: true,
  store: "memory",
  llm: "fake",
  languageCount: 1,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function harness(overrides: Partial<Parameters<typeof createCollector>[0]> = {}) {
  const batches: TelemetryBatch[] = [];
  const transport: TelemetryTransport = {
    send: async (batch) => {
      batches.push(batch);
    },
  };
  const collector = createCollector({
    transport,
    features,
    warn: vi.fn(),
    flushIntervalMs: 0,
    ...overrides,
  });
  return { collector, batches, transport };
}
async function flush(collector: ReturnType<typeof createCollector>) {
  const pending = collector.flushIfDue();
  if (pending) await pending;
}
const rollups = (batches: TelemetryBatch[]) =>
  batches.flatMap((batch) => batch.events).filter((event) => event.type === "usage.rollup");

describe("telemetry collector", () => {
  it("buckets boundaries and clamps invalid latency values", async () => {
    const { collector, batches } = harness();
    for (const latencyMs of [
      250,
      251,
      500,
      1000,
      2000,
      4000,
      8000,
      16000,
      16001,
      Number.NaN,
      -1,
      Number.POSITIVE_INFINITY,
    ])
      collector.turn({ language: "en", inputMode: "text", latencyMs, firstTokenMs: latencyMs });
    await flush(collector);
    expect(rollups(batches)[0]?.type).toBe("usage.rollup");
    const expected = [2, 2, 1, 1, 1, 1, 1, 3];
    expect(rollups(batches)[0]?.counters.latencyMs).toEqual({
      total: expected,
      firstToken: expected,
    });
  });
  it("caps distinct languages and ignores invalid tags while counting turns", async () => {
    const { collector, batches } = harness();
    for (let i = 0; i < 20; i++)
      collector.turn({
        language: `en-${String(i).padStart(2, "0")}`,
        inputMode: "text",
        latencyMs: 0,
      });
    collector.turn({ language: "fr-FR", inputMode: "voice", latencyMs: 0 });
    collector.turn({ language: "bad tag", inputMode: "text", latencyMs: 0 });
    await flush(collector);
    const rollup = rollups(batches)[0];
    expect(rollup?.type === "usage.rollup" && Object.keys(rollup.counters.languages)).toHaveLength(
      20,
    );
    expect(rollup?.type === "usage.rollup" && rollup.counters.turns).toBe(22);
  });
  it("saturates counters, drops empty rollups, and only emits init once", async () => {
    expect(nextCount(999_999_999)).toBe(1_000_000_000);
    expect(nextCount(1_000_000_000)).toBe(1_000_000_000);
    const { collector, batches } = harness();
    expect(collector.flushIfDue()).toBeNull();
    collector.session();
    await flush(collector);
    expect(batches[0]?.events.map((event) => event.type)).toEqual(["sdk.init", "usage.rollup"]);
    await flush(collector);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.schemaVersion).toBe(TELEMETRY_SCHEMA_VERSION);
  });
  it("resets after a failed attempt and does not resend init", async () => {
    const attempts: TelemetryBatch[] = [];
    const transport: TelemetryTransport = {
      send: async (batch) => {
        attempts.push(batch);
        if (attempts.length === 1) throw Error("private");
      },
    };
    const warn = vi.fn();
    const { collector } = harness({ transport, warn });
    collector.session();
    await flush(collector);
    collector.session();
    await flush(collector);
    expect(attempts[1]?.events.map((e) => e.type)).toEqual(["usage.rollup"]);
    expect(rollups(attempts).map((e) => e.counters.sessions)).toEqual([1, 1]);
    expect(warn.mock.calls).toEqual([["telemetry send failed"]]);
  });
  it("does not start concurrent sends and respects intervals", async () => {
    let resolve!: () => void;
    const transport: TelemetryTransport = {
      send: () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    };
    let now = 1000;
    const { collector } = harness({ transport, now: () => now, flushIntervalMs: 500 });
    collector.session();
    const first = collector.flushIfDue();
    expect(collector.flushIfDue()).toBeNull();
    collector.session();
    resolve();
    await first;
    expect(collector.flushIfDue()).toBeNull();
    now += 500;
    const second = collector.flushIfDue();
    expect(second).not.toBeNull();
    resolve();
    await second;
  });
  it("omits invalid project keys", async () => {
    const { collector, batches } = harness({ projectKey: "bad" });
    collector.session();
    await flush(collector);
    expect(batches[0]).not.toHaveProperty("projectKey");
  });
  it("returns the no-op sink without endpoint or when disabled", () => {
    vi.stubEnv("SPEEQ_PLATFORM_URL", "");
    const { store, llm } = makeSpeeq([]);
    const config = { store, llm, agent: { name: "Test", instructions: "" } };
    expect(createTelemetry(config)).toBe(noopTelemetry);
    expect(
      createTelemetry({
        ...config,
        telemetry: { enabled: false, endpoint: "https://platform.test" },
      }),
    ).toBe(noopTelemetry);
  });
  it("drops an invalid feature batch with a generic warning", async () => {
    const warn = vi.fn();
    const { collector, batches } = harness({
      warn,
      features: { ...features, store: "invalid private value" },
    });
    collector.session();
    await flush(collector);
    expect(batches).toEqual([]);
    expect(warn.mock.calls).toEqual([["telemetry batch rejected"]]);
    expect(collector.flushIfDue()).toBeNull();
  });
  it("sanitizes adapter kinds and includes a valid public project key", async () => {
    const { store, llm } = makeSpeeq([]);
    Object.defineProperty(store, "kind", { value: "invalid kind" });
    const { transport, batches } = harness();
    const sink = createTelemetry({
      agent: { name: "test", instructions: "" },
      store,
      llm: { kind: "private/kind", model: llm.model, stream: llm.stream.bind(llm) },
      projectKey: "pk_abcdefgh",
      telemetry: { transport },
    });
    sink.error("INTERNAL");
    await flush(sink);
    expect(batches[0]?.projectKey).toBe("pk_abcdefgh");
    expect(batches[0]?.events.map((e) => e.type)).toEqual(["sdk.init", "error.rollup"]);
    expect(batches[0]?.events[0]).toMatchObject({ features: { store: "custom", llm: "custom" } });
  });
  it("uses a credential-free default transport and treats non-success as failure", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    const transport = createHttpTransport("https://platform.test/");
    await expect(
      transport.send({} as TelemetryBatch, { signal: new AbortController().signal }),
    ).rejects.toThrow();
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://platform.test/api/v1/ingest");
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("content-type")).toBe(
      "application/json",
    );
  });
});

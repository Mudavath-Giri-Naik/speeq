import { describe, expect, it } from "vitest";
import {
  ConversationEventSchema,
  LATENCY_BUCKETS_MS,
  PROTOCOL_EVENT_TYPES,
  PROTOCOL_VERSION,
  ProtocolEventSchema,
  TelemetryBatchSchema,
  TurnRequestSchema,
} from "../src/index.js";

const zeros = () => Array.from({ length: LATENCY_BUCKETS_MS.length + 1 }, () => 0);

describe("protocol schemas", () => {
  it("accepts every event type", () => {
    const base = { protocolVersion: PROTOCOL_VERSION, turnId: "t1" };
    const samples = [
      { ...base, type: "turn.started", sessionId: "s", language: "en-IN" },
      { ...base, type: "assistant.delta", text: "Hi" },
      { ...base, type: "assistant.message", messageId: "m", text: "Hi" },
      { ...base, type: "tool.started", callId: "c", name: "x", kind: "custom" },
      { ...base, type: "tool.finished", callId: "c", name: "x", ok: true, durationMs: 3 },
      { ...base, type: "navigate", routeId: "pricing", href: "/pricing", params: {} },
      {
        ...base,
        type: "confirmation.required",
        confirmationId: "k",
        toolName: "b",
        summary: "s",
        args: {},
      },
      {
        ...base,
        type: "ui.action",
        callId: "u1",
        name: "ui_open_cart",
        args: {},
        summary: "Open the cart",
        confirm: false,
      },
      { ...base, type: "error", code: "RATE_LIMITED", message: "busy", retryable: true },
      { ...base, type: "turn.finished", reason: "completed", latencyMs: 10 },
    ];
    expect(samples.map((s) => ProtocolEventSchema.parse(s).type)).toEqual([
      ...PROTOCOL_EVENT_TYPES,
    ]);
  });

  it("rejects wrong protocol versions and unknown types", () => {
    expect(
      ProtocolEventSchema.safeParse({
        protocolVersion: 2,
        turnId: "t",
        type: "assistant.delta",
        text: "x",
      }).success,
    ).toBe(false);
    expect(
      ProtocolEventSchema.safeParse({ protocolVersion: 1, turnId: "t", type: "nope" }).success,
    ).toBe(false);
  });

  it("validates turn requests", () => {
    expect(TurnRequestSchema.safeParse({ text: "  ", language: "en-IN" }).success).toBe(false);
    expect(TurnRequestSchema.safeParse({ text: "x".repeat(2001), language: "en-IN" }).success).toBe(
      false,
    );
    expect(TurnRequestSchema.safeParse({ text: "hi", language: "english" }).success).toBe(false);
    expect(TurnRequestSchema.parse({ text: " hi ", language: "te-IN" }).text).toBe("hi");
  });

  it("validates audit events by type", () => {
    const meta = { id: "e", sessionId: "s", ts: new Date().toISOString(), userId: null, seq: 0 };
    expect(
      ConversationEventSchema.safeParse({
        ...meta,
        type: "navigation",
        data: { routeId: "a", href: "/a", params: {} },
      }).success,
    ).toBe(true);
    expect(
      ConversationEventSchema.safeParse({ ...meta, type: "navigation", data: { text: "x" } })
        .success,
    ).toBe(false);
  });
});

describe("telemetry schema", () => {
  const valid = () => ({
    schemaVersion: 1,
    instanceId: globalThis.crypto.randomUUID(),
    sentAt: new Date().toISOString(),
    events: [
      {
        type: "error.rollup",
        ts: new Date().toISOString(),
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        errors: { RATE_LIMITED: 2 },
      },
      {
        type: "usage.rollup",
        ts: new Date().toISOString(),
        periodStart: new Date().toISOString(),
        periodEnd: new Date().toISOString(),
        counters: {
          sessions: 1,
          turns: 2,
          voiceTurns: 1,
          textTurns: 1,
          toolCalls: { builtin: 1, custom: 1 },
          navigations: 1,
          knowledgeSearches: 0,
          confirmations: { requested: 0, approved: 0, rejected: 0 },
          languages: { "en-IN": 2 },
          latencyMs: { total: zeros(), firstToken: zeros() },
        },
      },
    ],
  });

  it("accepts a valid batch", () => {
    expect(TelemetryBatchSchema.safeParse(valid()).success).toBe(true);
  });

  it("rejects unknown fields anywhere (no room for free text)", () => {
    const b = valid() as Record<string, unknown>;
    expect(TelemetryBatchSchema.safeParse({ ...b, userId: "u1" }).success).toBe(false);
    const withText = valid();
    (withText.events[1] as { counters: Record<string, unknown> }).counters.lastMessage = "hello";
    expect(TelemetryBatchSchema.safeParse(withText).success).toBe(false);
  });

  it("rejects free text in keyed records", () => {
    const b = valid();
    (b.events[1] as { counters: { languages: Record<string, number> } }).counters.languages = {
      "take me to /admin": 1,
    };
    expect(TelemetryBatchSchema.safeParse(b).success).toBe(false);
    const e = valid();
    (e.events[0] as { errors: Record<string, number> }).errors = { "secret text": 1 };
    expect(TelemetryBatchSchema.safeParse(e).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  ConversationEventBodySchema,
  CreateSessionRequestSchema,
  PROTOCOL_VERSION,
  ProtocolEventSchema,
  UiResultRequestSchema,
} from "../src/index.js";

const base = { protocolVersion: PROTOCOL_VERSION, turnId: "t1" };
const action = {
  ...base,
  type: "ui.action",
  callId: "u1",
  name: "ui_x",
  args: { a: 1 },
  summary: "Do x",
  confirm: true,
};

describe("ui.action event", () => {
  it("accepts a complete event", () => {
    expect(ProtocolEventSchema.parse(action).type).toBe("ui.action");
  });
  it("rejects missing or mistyped fields", () => {
    for (const patch of [{ callId: undefined }, { summary: undefined }, { confirm: "yes" }]) {
      expect(ProtocolEventSchema.safeParse({ ...action, ...patch }).success).toBe(false);
    }
  });
});

describe("ui-result request", () => {
  it("accepts every status and an optional result", () => {
    for (const status of ["done", "declined", "failed", "unavailable"]) {
      expect(UiResultRequestSchema.safeParse({ callId: "u1", status }).success).toBe(true);
    }
    expect(UiResultRequestSchema.parse({ callId: "u1", status: "done", result: { n: 1 } })).toEqual(
      { callId: "u1", status: "done", result: { n: 1 } },
    );
  });
  it("rejects empty and oversized call ids and unknown statuses", () => {
    expect(UiResultRequestSchema.safeParse({ callId: "", status: "done" }).success).toBe(false);
    expect(
      UiResultRequestSchema.safeParse({ callId: "x".repeat(201), status: "done" }).success,
    ).toBe(false);
    expect(UiResultRequestSchema.safeParse({ callId: "u", status: "ok" }).success).toBe(false);
  });
});

describe("session capabilities", () => {
  it("accepts only ui-actions", () => {
    expect(CreateSessionRequestSchema.safeParse({ capabilities: ["ui-actions"] }).success).toBe(
      true,
    );
    expect(CreateSessionRequestSchema.safeParse({ capabilities: ["dom-control"] }).success).toBe(
      false,
    );
    expect(CreateSessionRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe("ui audit events", () => {
  it("validates requested and resolved data", () => {
    const requested = {
      type: "ui.action.requested",
      data: { callId: "u", toolCallId: "c", name: "ui_x", args: {}, summary: "s", confirm: false },
    };
    expect(ConversationEventBodySchema.safeParse(requested).success).toBe(true);
    expect(
      ConversationEventBodySchema.safeParse({
        type: "ui.action.resolved",
        data: { callId: "u", status: "declined", userId: null, reason: "superseded" },
      }).success,
    ).toBe(true);
    expect(
      ConversationEventBodySchema.safeParse({
        type: "ui.action.resolved",
        data: { callId: "u", status: "nope", userId: null },
      }).success,
    ).toBe(false);
  });
});

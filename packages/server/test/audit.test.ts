import type { SessionDetailResponse, SessionListResponse } from "@speeq/core";
import { REDACTED } from "@speeq/core";
import { jsonRequest, startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../src/index.js";
import { makeSpeeq } from "./helpers.js";

const isAdmin = (req: Request) => req.headers.get("x-admin") === "yes";
const admin = { "x-admin": "yes" };

describe("audit endpoints", () => {
  it("do not exist without audit.authorize (404)", async () => {
    const { speeq } = makeSpeeq([{ text: "hi" }]);
    await (await startSession(speeq.handler)).turn("hello");
    expect(
      (await speeq.handler(jsonRequest("/api/speeq/audit/sessions", { headers: admin }))).status,
    ).toBe(404);
    expect(
      (await speeq.handler(jsonRequest("/api/speeq/audit/sessions/x", { headers: admin }))).status,
    ).toBe(404);
  });

  it("refuse requests that authorize rejects (403), including when it throws", async () => {
    const { speeq } = makeSpeeq([], { audit: { authorize: isAdmin } });
    expect((await speeq.handler(jsonRequest("/api/speeq/audit/sessions"))).status).toBe(403);
    const throwing = makeSpeeq([], {
      audit: {
        authorize: () => {
          throw new Error("db down");
        },
      },
    });
    expect(
      (await throwing.speeq.handler(jsonRequest("/api/speeq/audit/sessions", { headers: admin })))
        .status,
    ).toBe(403);
  });

  it("list sessions and return an ordered timeline", async () => {
    const { speeq } = makeSpeeq(
      [
        { toolCalls: [{ name: "navigate", arguments: { routeId: "pricing" } }] },
        { text: "Opening pricing." },
      ],
      { audit: { authorize: isAdmin } },
    );
    const s = await startSession(speeq.handler);
    await s.turn("take me to pricing");
    const list = (await (
      await speeq.handler(jsonRequest("/api/speeq/audit/sessions", { headers: admin }))
    ).json()) as SessionListResponse;
    expect(list.sessions[0]).toMatchObject({
      id: s.sessionId,
      turnCount: 1,
      navigationCount: 1,
      preview: "take me to pricing",
    });
    const detail = (await (
      await speeq.handler(
        jsonRequest(`/api/speeq/audit/sessions/${s.sessionId}`, { headers: admin }),
      )
    ).json()) as SessionDetailResponse;
    expect(detail.events.map((e) => e.type)).toEqual([
      "session.started",
      "user.message",
      "assistant.message",
      "tool.called",
      "navigation",
      "assistant.message",
      "turn.finished",
    ]);
    expect(detail.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("redacts secret-looking tool args by default and applies audit.redact", async () => {
    const login = defineTool({
      name: "check_card",
      description: "x",
      input: z.object({ cardNumber: z.string(), note: z.string() }),
      handler: () => ({ ok: true }),
    });
    const { speeq, store } = makeSpeeq(
      [
        {
          toolCalls: [
            { name: "check_card", arguments: { cardNumber: "4111111111111111", note: "hi" } },
          ],
        },
        { text: "ok" },
      ],
      {
        tools: [login],
        audit: {
          authorize: isAdmin,
          redact: (e) =>
            e.type === "user.message" ? { ...e, data: { ...e.data, text: "[hidden]" } } : e,
        },
      },
    );
    const s = await startSession(speeq.handler);
    await s.turn("my email is a@b.com");
    const events = await store.listEvents(s.sessionId);
    const tool = events.find((e) => e.type === "tool.called");
    expect(tool?.type === "tool.called" && tool.data.args).toEqual({
      cardNumber: REDACTED,
      note: "hi",
    });
    const user = events.find((e) => e.type === "user.message");
    expect(user?.type === "user.message" && user.data.text).toBe("[hidden]");
    expect(JSON.stringify(events)).not.toContain("4111111111111111");
  });

  it("purges sessions older than retentionDays", async () => {
    const { speeq, store } = makeSpeeq([], { audit: { retentionDays: 30 } });
    await store.createSession({
      id: "old",
      userId: null,
      language: "en-IN",
      startedAt: "2020-01-01T00:00:00.000Z",
    });
    expect(await speeq.purgeExpired()).toEqual({ sessions: 1, events: 0 });
    expect(await store.getSessionSummary("old")).toBeNull();
  });
});

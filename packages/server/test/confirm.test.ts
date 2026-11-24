import type { ProtocolEvent } from "@speeq/core";
import { jsonRequest, startSession } from "@speeq/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { bookmarks, makeSpeeq, userResolver } from "./helpers.js";

const askToBookmark = {
  toolCalls: [{ name: "bookmark_question", arguments: { questionId: "q7" } }],
};

function confirmationId(events: ProtocolEvent[]): string {
  const e = events.find((x) => x.type === "confirmation.required");
  if (e?.type !== "confirmation.required") throw new Error("no confirmation.required event");
  return e.confirmationId;
}

describe("confirmation flow", () => {
  beforeEach(() => {
    bookmarks.length = 0;
  });

  it("does not run a write tool before confirmation", async () => {
    const { speeq } = makeSpeeq([askToBookmark]);
    const events = await (await startSession(speeq.handler)).turn("bookmark this");
    expect(events.find((e) => e.type === "confirmation.required")).toMatchObject({
      toolName: "bookmark_question",
      summary: "Bookmark question q7?",
    });
    expect(events.at(-1)).toMatchObject({ type: "turn.finished", reason: "confirmation_required" });
    expect(bookmarks).toEqual([]);
  });

  it("runs the tool on approval and resumes the agent", async () => {
    const { speeq, store } = makeSpeeq([askToBookmark, { text: "Bookmarked." }], {
      resolveUser: userResolver,
    });
    const headers = { "x-test-user": "alice" };
    const s = await startSession(speeq.handler, { headers });
    const id = confirmationId(await s.turn("bookmark this"));
    const events = await s.confirm(id, true, headers);
    expect(events.find((e) => e.type === "tool.finished")).toMatchObject({
      name: "bookmark_question",
      ok: true,
    });
    expect(events.find((e) => e.type === "assistant.message")).toMatchObject({
      text: "Bookmarked.",
    });
    expect(bookmarks).toEqual([{ userId: "alice", questionId: "q7" }]);
    const types = (await store.listEvents(s.sessionId)).map((e) => e.type);
    expect(types).toContain("confirmation.requested");
    expect(types).toContain("confirmation.resolved");
  });

  it("does not run the tool on rejection and tells the model", async () => {
    const { speeq, llm } = makeSpeeq([askToBookmark, { text: "OK, I won't." }]);
    const s = await startSession(speeq.handler);
    await s.confirm(confirmationId(await s.turn("bookmark this")), false);
    expect(bookmarks).toEqual([]);
    expect(JSON.stringify(llm.requests[1]?.messages)).toContain("declined");
  });

  it("refuses replays of the same confirmation (409)", async () => {
    const { speeq } = makeSpeeq([askToBookmark, { text: "Done." }]);
    const s = await startSession(speeq.handler);
    const id = confirmationId(await s.turn("bookmark this"));
    await s.confirm(id, true);
    const replay = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/confirm`, {
        body: { confirmationId: id, approved: true },
        token: s.token,
      }),
    );
    expect(replay.status).toBe(409);
    expect(bookmarks).toHaveLength(1);
  });

  it("refuses a confirmation id from another session (404)", async () => {
    const { speeq } = makeSpeeq([askToBookmark]);
    const victim = await startSession(speeq.handler);
    const id = confirmationId(await victim.turn("bookmark this"));
    const attacker = await startSession(speeq.handler);
    const res = await speeq.handler(
      jsonRequest(`/api/speeq/session/${attacker.sessionId}/confirm`, {
        body: { confirmationId: id, approved: true },
        token: attacker.token,
      }),
    );
    expect(res.status).toBe(404);
    expect(bookmarks).toEqual([]);
  });

  it("refuses a confirmation from a different signed-in user (403)", async () => {
    const { speeq } = makeSpeeq([askToBookmark], { resolveUser: userResolver });
    const s = await startSession(speeq.handler, { headers: { "x-test-user": "alice" } });
    const id = confirmationId(
      await s.turn("bookmark this", { headers: { "x-test-user": "alice" } }),
    );
    const res = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/confirm`, {
        body: { confirmationId: id, approved: true },
        token: s.token,
        headers: { "x-test-user": "mallory" },
      }),
    );
    expect(res.status).toBe(403);
    expect(bookmarks).toEqual([]);
  });

  it("auto-declines a pending confirmation when the user sends a new turn", async () => {
    const { speeq, llm } = makeSpeeq([askToBookmark, { text: "Sure, something else." }]);
    const s = await startSession(speeq.handler);
    const id = confirmationId(await s.turn("bookmark this"));
    await s.turn("never mind, what is new?");
    const late = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/confirm`, {
        body: { confirmationId: id, approved: true },
        token: s.token,
      }),
    );
    expect(late.status).toBe(409);
    expect(bookmarks).toEqual([]);
    expect(JSON.stringify(llm.requests[1]?.messages)).toContain("moved on without confirming");
  });
});

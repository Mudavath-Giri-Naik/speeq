import { encodeSse } from "@speeq/core/utils";
import { FakeSpeechInput, FakeSpeechOutput } from "@speeq/testing";
import { describe, expect, it, vi } from "vitest";
import { createSpeeqClient } from "../src/index.js";

const config = {
  agentName: "Helper",
  languages: ["en-US"],
  defaultLanguage: "en-US",
  features: { navigation: true, knowledge: false, tools: true, audit: true },
  routes: [],
};
const session = () => ({
  sessionId: "s",
  sessionToken: "token",
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  config,
});
function frame(type: string, fields: Record<string, unknown> = {}) {
  return encodeSse(type, JSON.stringify({ protocolVersion: 1, turnId: "turn", type, ...fields }));
}
const finished = frame("turn.finished", { reason: "completed", latencyMs: 1 });
const uiAction = (confirm: boolean, name = "ui_open_panel") =>
  frame("ui.action", { callId: "uia_1", name, args: { panel: "cart" }, summary: "Open", confirm }) +
  frame("turn.finished", { reason: "ui_action_required", latencyMs: 1 });
const answer = frame("assistant.message", { text: "Done." }) + finished;
function stream(wire: string) {
  const bytes = new TextEncoder().encode(wire);
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(bytes);
        c.close();
      },
    }),
  );
}

/** A server stub: the first turn answers with `first`, later requests with `after`. */
function setup(first: string, after = answer) {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  let turns = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    posts.push({ url: String(url), body });
    if (String(url).endsWith("/session")) return Response.json(session());
    return stream(String(url).endsWith("/turn") && turns++ === 0 ? first : after);
  });
  const client = createSpeeqClient({
    endpoint: "/api/speeq",
    fetch,
    speech: { input: new FakeSpeechInput(), output: new FakeSpeechOutput() },
  });
  const results = () => posts.filter((p) => p.url.endsWith("/ui-result")).map((p) => p.body);
  return { client, posts, results };
}

describe("UI actions: session negotiation", () => {
  it("sends the capability only when a handler is registered", async () => {
    const without = setup(answer);
    await without.client.sendText("hi");
    expect(without.posts[0]?.body).not.toHaveProperty("capabilities");

    const withHandler = setup(answer);
    withHandler.client.registerUiAction("ui_open_panel", () => undefined);
    await withHandler.client.sendText("hi");
    expect(withHandler.posts[0]?.body).toMatchObject({ capabilities: ["ui-actions"] });
  });
});

describe("UI actions: handlers", () => {
  it("answers unavailable when no handler is mounted", async () => {
    const { client, results } = setup(uiAction(false));
    await client.sendText("open");
    expect(results()).toEqual([{ callId: "uia_1", status: "unavailable" }]);
  });

  it("runs a read action and posts done with the result", async () => {
    const { client, results } = setup(uiAction(false));
    const handler = vi.fn(() => ({ opened: true }));
    client.registerUiAction("ui_open_panel", handler);
    await client.sendText("open");
    expect(handler).toHaveBeenCalledWith({ panel: "cart" }, expect.any(AbortSignal));
    expect(results()).toEqual([{ callId: "uia_1", status: "done", result: { opened: true } }]);
    expect(client.getSnapshot().messages.at(-1)?.text).toBe("Done.");
  });

  it("posts failed without the error message when the handler throws", async () => {
    const { client, results } = setup(uiAction(false));
    client.registerUiAction("ui_open_panel", () => {
      throw new Error("secret detail");
    });
    await client.sendText("open");
    expect(results()).toEqual([{ callId: "uia_1", status: "failed" }]);
  });

  it("omits results that are too large or not JSON", async () => {
    for (const value of ["x".repeat(3000), () => 1, undefined]) {
      const { client, results } = setup(uiAction(false));
      client.registerUiAction("ui_open_panel", () => value);
      await client.sendText("open");
      expect(results()).toEqual([{ callId: "uia_1", status: "done" }]);
    }
  });

  it("answers unavailable after the handler is unregistered", async () => {
    const { client, results } = setup(uiAction(false));
    const off = client.registerUiAction("ui_open_panel", vi.fn());
    off();
    await client.sendText("open");
    expect(results()).toEqual([{ callId: "uia_1", status: "unavailable" }]);
  });

  it("does not let a stale unregister remove a newer handler", async () => {
    const { client, results } = setup(uiAction(false));
    const off = client.registerUiAction("ui_open_panel", vi.fn());
    const next = vi.fn(() => 1);
    client.registerUiAction("ui_open_panel", next);
    off();
    await client.sendText("open");
    expect(next).toHaveBeenCalled();
    expect(results()[0]).toMatchObject({ status: "done" });
  });
});

describe("UI actions: consent", () => {
  it("waits for approval before running the handler", async () => {
    const { client, results } = setup(uiAction(true));
    const handler = vi.fn(() => "ok");
    client.registerUiAction("ui_open_panel", handler);
    await client.sendText("open");
    expect(handler).not.toHaveBeenCalled();
    expect(results()).toEqual([]);
    expect(client.getSnapshot().pendingUiAction).toEqual({
      callId: "uia_1",
      name: "ui_open_panel",
      args: { panel: "cart" },
      summary: "Open",
    });
    await client.resolveUiAction("uia_1", true);
    expect(handler).toHaveBeenCalledOnce();
    expect(results()).toEqual([{ callId: "uia_1", status: "done", result: "ok" }]);
    expect(client.getSnapshot().pendingUiAction).toBeNull();
  });

  it("never calls the handler when the user declines", async () => {
    const { client, results } = setup(uiAction(true));
    const handler = vi.fn();
    client.registerUiAction("ui_open_panel", handler);
    await client.sendText("open");
    await client.resolveUiAction("uia_1", false);
    expect(handler).not.toHaveBeenCalled();
    expect(results()).toEqual([{ callId: "uia_1", status: "declined" }]);
  });

  it("ignores an id that is not pending", async () => {
    const { client, results, posts } = setup(uiAction(true));
    client.registerUiAction("ui_open_panel", vi.fn());
    await client.sendText("open");
    const before = posts.length;
    await client.resolveUiAction("other", true);
    expect(posts.length).toBe(before);
    expect(results()).toEqual([]);
  });

  it("clears the pending action when the user sends a new message", async () => {
    const { client } = setup(uiAction(true));
    client.registerUiAction("ui_open_panel", vi.fn());
    await client.sendText("open");
    expect(client.getSnapshot().pendingUiAction).not.toBeNull();
    await client.sendText("never mind");
    expect(client.getSnapshot().pendingUiAction).toBeNull();
  });

  it("posts nothing after destroy while an action is pending", async () => {
    const { client, results } = setup(uiAction(true));
    client.registerUiAction("ui_open_panel", vi.fn());
    await client.sendText("open");
    client.destroy();
    await client.resolveUiAction("uia_1", true);
    expect(results()).toEqual([]);
  });

  it("does not post when destroyed while the handler runs", async () => {
    const { client, results } = setup(uiAction(false));
    client.registerUiAction("ui_open_panel", async () => {
      client.destroy();
      return 1;
    });
    await client.sendText("open");
    expect(results()).toEqual([]);
  });
});

describe("UI actions: compatibility", () => {
  it("behaves as before when the server never sends UI events", async () => {
    const { client, posts } = setup(answer);
    client.registerUiAction("ui_open_panel", vi.fn());
    await client.sendText("hi");
    expect(posts.some((p) => p.url.endsWith("/ui-result"))).toBe(false);
    expect(client.getSnapshot().messages.at(-1)?.text).toBe("Done.");
  });
});

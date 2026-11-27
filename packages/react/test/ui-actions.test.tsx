import { createSpeeqClient } from "@speeq/client";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SpeeqProvider, useSpeeq, useSpeeqAction } from "../src/index.js";

afterEach(cleanup);

const endpoint = "/api/speeq";
const frames = (events: Array<Record<string, unknown>>) =>
  events
    .map((e) => `data: ${JSON.stringify({ ...e, protocolVersion: 1, turnId: "turn" })}\n\n`)
    .join("");

function transport() {
  let turns = 0;
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (String(url).endsWith("/session"))
      return Response.json({
        sessionId: "s",
        sessionToken: "t",
        expiresAt: new Date(Date.now() + 100_000).toISOString(),
        config: {
          agentName: "Helper",
          languages: ["en-IN"],
          defaultLanguage: "en-IN",
          features: { navigation: false, knowledge: false, tools: false, audit: false },
          routes: [],
        },
      });
    const first = String(url).endsWith("/turn") && turns++ === 0;
    return new Response(
      frames(
        first
          ? [
              {
                type: "ui.action",
                callId: "u1",
                name: "ui_open_panel",
                args: { panel: "cart" },
                summary: "Open the cart",
                confirm: false,
              },
              { type: "turn.finished", reason: "ui_action_required", latencyMs: 1 },
            ]
          : [
              { type: "assistant.message", messageId: "m", text: "Opened." },
              { type: "turn.finished", reason: "completed", latencyMs: 1 },
            ],
      ),
    );
  });
  return fetch;
}

function wrapperFor(client: ReturnType<typeof createSpeeqClient>) {
  return ({ children }: { children: ReactNode }) => (
    <SpeeqProvider endpoint={endpoint} client={client}>
      {children}
    </SpeeqProvider>
  );
}
const makeClient = (fetch: typeof globalThis.fetch) =>
  createSpeeqClient({ endpoint, fetch, speech: { input: null, output: null } });

it("registers on mount, runs the latest handler and unregisters on unmount", async () => {
  const fetch = transport();
  const client = makeClient(fetch);
  const register = vi.spyOn(client, "registerUiAction");
  const first = vi.fn((): unknown => "first");
  const latest = vi.fn((): unknown => ({ ok: true }));
  const { rerender, unmount } = renderHook(({ fn }) => useSpeeqAction("ui_open_panel", fn), {
    wrapper: wrapperFor(client),
    initialProps: { fn: first },
  });
  rerender({ fn: latest });
  expect(register).toHaveBeenCalledTimes(1);
  const chat = renderHook(() => useSpeeq(), { wrapper: wrapperFor(client) });
  await act(async () => {
    await chat.result.current.sendText("open");
  });
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith({ panel: "cart" }, expect.any(AbortSignal));
  const body = JSON.parse(
    String(fetch.mock.calls.find(([u]) => String(u).endsWith("/ui-result"))?.[1]?.body),
  );
  expect(body).toEqual({ callId: "u1", status: "done", result: { ok: true } });

  unmount();
  const unavailable = transport();
  const other = makeClient(unavailable);
  await other.sendText("open");
  const post = unavailable.mock.calls.find(([u]) => String(u).endsWith("/ui-result"));
  expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ status: "unavailable" });
});

const unmountedHandler = vi.fn();
function Page() {
  useSpeeqAction("ui_open_panel", unmountedHandler);
  return null;
}

it("stops handling after unmount", async () => {
  const client = makeClient(transport());
  const view = render(
    <SpeeqProvider endpoint={endpoint} client={client}>
      <Page />
    </SpeeqProvider>,
  );
  view.unmount();
  await client.sendText("open");
  expect(unmountedHandler).not.toHaveBeenCalled();
});

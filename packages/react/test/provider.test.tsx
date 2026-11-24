import { createSpeeqClient, type SpeeqClient, type SpeeqClientEvents } from "@speeq/client";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  SpeeqProvider,
  type UseSpeeqResult,
  useSpeeq,
  useSpeeqContext,
  useSpeeqEvent,
} from "../src/index.js";

afterEach(cleanup);

const endpoint = "/api/speeq";
const navigate = { routeId: "pricing", href: "/pricing", params: {} };
function transport() {
  return vi.fn<typeof globalThis.fetch>(async (url) => {
    if (String(url).endsWith("/session")) {
      return Response.json({
        sessionId: "s",
        sessionToken: "t",
        expiresAt: new Date(Date.now() + 100_000).toISOString(),
        config: {
          agentName: "Helper",
          languages: ["en-IN"],
          defaultLanguage: "en-IN",
          features: { navigation: true, knowledge: false, tools: false, audit: false },
          routes: [],
        },
      });
    }
    const stream = [
      { type: "navigate", ...navigate },
      { type: "assistant.message", messageId: "m", text: "Hello" },
      { type: "turn.finished", reason: "completed", latencyMs: 1 },
    ]
      .map(
        (event) => `data: ${JSON.stringify({ ...event, protocolVersion: 1, turnId: "turn" })}\n\n`,
      )
      .join("");
    return new Response(stream);
  });
}

function Chat({ read }: { read: (result: UseSpeeqResult) => void }) {
  const result = useSpeeq();
  read(result);
  return (
    <button type="button" onClick={() => void result.sendText("Hi")}>
      {result.messages.map((message) => message.text).join(" ") || result.state}
    </button>
  );
}

function Context({ data }: { data: Record<string, unknown> }) {
  useSpeeqContext(data);
  return null;
}

function Events({
  client,
  onNavigate,
  onEvent,
}: {
  client: SpeeqClient;
  onNavigate: (payload: SpeeqClientEvents["navigate"]) => void;
  onEvent: (payload: SpeeqClientEvents["event"]) => void;
}) {
  useSpeeqEvent("navigate", onNavigate);
  useSpeeqEvent("event", onEvent);
  expect(useSpeeq().client).toBe(client);
  return null;
}

it("gives an actionable error when used outside a provider", () => {
  expect(() => renderHook(useSpeeq)).toThrow("useSpeeq must be used inside <SpeeqProvider>");
});

it("keeps stable actions and completes a text turn after Strict Mode effect replay", async () => {
  const fetch = transport();
  const renders: UseSpeeqResult[] = [];
  render(
    <StrictMode>
      <SpeeqProvider endpoint={endpoint} fetch={fetch}>
        <Chat read={(result) => renders.push(result)} />
      </SpeeqProvider>
    </StrictMode>,
  );
  const initial = renders.at(-1);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText("Hi Hello");
  expect(renders.some((result) => result.state === "thinking")).toBe(true);
  expect(renders.at(-1)?.state).toBe("idle");
  expect(renders.at(-1)?.sendText).toBe(initial?.sendText);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("uses latest navigation and context props and merges mounted hooks in order", async () => {
  const fetch = transport();
  const first = vi.fn(),
    second = vi.fn();
  let current: UseSpeeqResult | undefined;
  const app = (iteration: number) => (
    <SpeeqProvider
      endpoint={endpoint}
      fetch={fetch}
      onNavigate={iteration ? second : first}
      getContext={() => ({ path: "/questions", data: { base: iteration, question: "base" } })}
    >
      <Context data={{ question: iteration, section: "quiz" }} />
      {!iteration && <Context data={{ question: "later", other: true }} />}
      <Chat
        read={(result) => {
          current = result;
        }}
      />
    </SpeeqProvider>
  );
  const view = render(app(0));
  const client = current?.client;
  const action = current?.sendText;
  await act(async () => {
    await current?.sendText("first");
  });
  expect(JSON.parse(String(fetch.mock.lastCall?.[1]?.body)).context).toMatchObject({
    path: "/questions",
    data: { base: 0, section: "quiz", question: "later", other: true },
  });
  view.rerender(app(1));
  expect(current?.client).toBe(client);
  expect(current?.sendText).toBe(action);
  await act(async () => {
    await current?.sendText("next");
  });
  expect(JSON.parse(String(fetch.mock.lastCall?.[1]?.body)).context.data).toEqual({
    base: 1,
    section: "quiz",
    question: 1,
  });
  expect(first).toHaveBeenCalledExactlyOnceWith(navigate);
  expect(second).toHaveBeenCalledExactlyOnceWith(navigate);
});

it("keeps subscriptions across handler changes and leaves a supplied client running", async () => {
  const client = createSpeeqClient({ endpoint, fetch: transport() });
  const cancel = vi.spyOn(client, "cancel");
  const on = vi.spyOn(client, "on");
  const first = vi.fn(),
    second = vi.fn(),
    events = vi.fn();
  const app = (onNavigate: typeof first) => (
    <SpeeqProvider endpoint={endpoint} client={client}>
      <Events client={client} onNavigate={onNavigate} onEvent={events} />
    </SpeeqProvider>
  );
  const view = render(app(first));
  view.rerender(app(second));
  expect(on).toHaveBeenCalledTimes(2);
  await act(async () => {
    await client.sendText("Hi");
  });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledExactlyOnceWith(navigate);
  expect(events).toHaveBeenCalledWith(expect.objectContaining({ type: "turn.finished" }));
  view.unmount();
  expect(cancel).not.toHaveBeenCalled();
});

import { createSpeeq } from "@speeq/server";
import { createMemoryStore } from "@speeq/store-memory";
import { FakeLLMProvider } from "@speeq/testing";
import { expect, it, vi } from "vitest";
import { createAuditClient, createSpeeqClient, SpeeqError } from "../src/index.js";

function setup(authorize?: (request: Request) => boolean) {
  const id = "user + /?";
  const { handler } = createSpeeq({
    agent: { name: "Helper", instructions: "Help the user." },
    secret: "audit-integration-test-secret-value",
    llm: new FakeLLMProvider([{ text: "Hello." }]),
    store: createMemoryStore({ quiet: true }),
    resolveUser: () => ({ id }),
    audit: { authorize },
    telemetry: { enabled: false },
  });
  const fetch = vi.fn<typeof globalThis.fetch>((url, init) =>
    handler(new Request(new URL(String(url), "http://localhost"), init)),
  );
  return { endpoint: "/api/speeq", fetch, id };
}

it("lists authorized sessions and reads ordered events with the host credentials", async () => {
  const { endpoint, fetch, id } = setup((request) => request.headers.get("x-admin") === "yes");
  const client = createSpeeqClient({ endpoint, fetch });
  await client.sendText("Hi");
  const audit = createAuditClient({
    endpoint: `${endpoint}/`,
    fetch,
    headers: { "x-admin": "yes" },
  });
  const { sessions } = await audit.listSessions({ userId: id, limit: 1, from: "", cursor: null });
  const sessionId = client.getSnapshot().sessionId;
  expect(sessionId).toBeTruthy();
  expect(sessions).toMatchObject([{ id: sessionId, userId: id, preview: "Hi" }]);
  const list = fetch.mock.calls.find(([url]) => String(url).includes("?"));
  expect(list?.[0]).toBe(`${endpoint}/audit/sessions?userId=user+%2B+%2F%3F&limit=1`);
  expect(list?.[1]).toMatchObject({
    method: "GET",
    credentials: "include",
    headers: { "x-admin": "yes" },
  });
  const { session, events } = await audit.getSession(String(sessionId));
  expect(session).toEqual(sessions[0]);
  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "user.message",
    "assistant.message",
    "turn.finished",
  ]);
  expect(events.map((event) => event.seq)).toEqual([0, 1, 2, 3]);
  await expect(audit.getSession("slash/id ?")).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(fetch.mock.lastCall?.[0]).toBe(`${endpoint}/audit/sessions/slash%2Fid%20%3F`);
});

it.each([
  ["NOT_FOUND", undefined],
  ["FORBIDDEN", () => false],
] as const)("preserves %s", async (code, authorize) => {
  const request = createAuditClient(setup(authorize)).listSessions();
  await expect(request).rejects.toBeInstanceOf(SpeeqError);
  await expect(request).rejects.toMatchObject({ code });
});

it("maps bad responses and network errors", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response("failure", { status: 500 }))
    .mockResolvedValueOnce(Response.json({ sessions: {} }))
    .mockResolvedValueOnce(Response.json({ session: "wrong", events: [] }))
    .mockRejectedValueOnce(new Error("network"));
  const audit = createAuditClient({ endpoint: "/api", fetch, credentials: "omit" });
  await expect(audit.listSessions()).rejects.toMatchObject({ code: "INTERNAL" });
  await expect(audit.listSessions()).rejects.toMatchObject({ code: "INTERNAL" });
  await expect(audit.getSession("id")).rejects.toMatchObject({ code: "INTERNAL" });
  await expect(audit.listSessions()).rejects.toMatchObject({
    code: "INTERNAL",
    message: "Could not reach the server.",
    retryable: true,
  });
  expect(fetch.mock.lastCall?.[1]?.credentials).toBe("omit");
});

it("rethrows the original abort from fetch and from reading the body", async () => {
  const abort = new DOMException("Stopped", "AbortError");
  const signal = AbortSignal.abort(abort);
  const response = Response.json({});
  vi.spyOn(response, "json").mockRejectedValue(abort);
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockRejectedValueOnce(abort)
    .mockResolvedValueOnce(response);
  const audit = createAuditClient({ endpoint: "/api", fetch });
  await expect(audit.listSessions({}, signal)).rejects.toBe(abort);
  await expect(audit.getSession("s", signal)).rejects.toBe(abort);
  expect(fetch.mock.lastCall?.[1]?.signal).toBe(signal);
});

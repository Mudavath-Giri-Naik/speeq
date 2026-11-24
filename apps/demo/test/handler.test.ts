import { createMemoryStore } from "@speeq/store-memory";
import { assistantText, jsonRequest, startSession } from "@speeq/testing";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { repo } from "../lib/data/repository";
import { DEMO_COOKIE, signDemoSession } from "../lib/demo-auth";
import { createDemoSpeeq } from "../lib/speeq-config";

const secret = "demo-handler-explicit-test-secret-value";
const env = { NODE_ENV: "test", SPEEQ_SECRET: secret, SPEEQ_LLM: "mock" };
beforeEach(() => vi.stubEnv("SPEEQ_TELEMETRY", "0"));
afterEach(() => vi.unstubAllEnvs());

function setup() {
  const bookmarks = new Map<string, Set<number>>();
  const store = createMemoryStore({ quiet: true });
  const { speeq, llmMode } = createDemoSpeeq({ env, mockDelayMs: 0, store, bookmarks });
  expect(llmMode).toBe("mock");
  return { handler: speeq.handler, bookmarks };
}

async function cookie(id: string) {
  const token = await signDemoSession(id, secret, Math.floor(Date.now() / 1000));
  return { cookie: `${DEMO_COOKIE}=${token}` };
}

type Events = Awaited<ReturnType<Awaited<ReturnType<typeof startSession>>["turn"]>>;
function confirmation(events: Events) {
  const pending = events.find((event) => event.type === "confirmation.required");
  if (!pending) throw new Error("Expected a confirmation event");
  return pending;
}

it.each([
  ["en-IN", "take me to pricing", "/pricing", "Opening Pricing."],
  ["en-IN", "show me subject chemistry", "/subjects/chemistry", "Opening Subject."],
  ["en-IN", "could you show me the available pricing plans", "/pricing", "Opening Pricing."],
  ["te-IN", "ధరలు చూపించు", "/pricing", "ధరలు తెరుస్తున్నాను."],
  ["hi-IN", "मुझे कीमत दिखाओ", "/pricing", "कीमतें खोल रहे हैं।"],
] as const)("navigates in %s for %s", async (language, text, href, reply) => {
  const session = await startSession(setup().handler, { language });
  const events = await session.turn(text);
  expect(events).toContainEqual(expect.objectContaining({ type: "navigate", href }));
  expect(assistantText(events)).toBe(reply);
});

it.each([
  ["en-IN", "how many questions are there in physics", "There are 10 questions in Physics."],
  ["hi-IN", "भौतिकी में कितने प्रश्न हैं", "भौतिकी में 10 प्रश्न हैं।"],
] as const)("counts questions in %s", async (language, text, answer) => {
  const session = await startSession(setup().handler, { language });
  expect(assistantText(await session.turn(text))).toBe(answer);
});

it("answers using the top matching topic and lists a subject's topics", async () => {
  const session = await startSession(setup().handler);
  const topic = repo.listTopics("physics")[0];
  if (!topic) throw new Error("Missing catalogue topic");
  expect(assistantText(await session.turn(`tell me about ${topic.name}`))).toContain(topic.summary);
  expect(assistantText(await session.turn("physics topics"))).toBe(
    "Topics: Motion, Electric circuits, Light.",
  );
});

it("confirms a signed-in bookmark before saving it, then lists it", async () => {
  const { handler, bookmarks } = setup();
  const session = await startSession(handler, { headers: await cookie("student-1") });
  const pending = confirmation(await session.turn("bookmark question 12"));
  expect(pending).toMatchObject({
    toolName: "bookmark_question",
    args: { questionId: 12 },
    summary:
      'Bookmark question 12: "A neutral atom has 8 protons. How many electrons does it ha…"?',
  });
  expect(bookmarks.has("student-1")).toBe(false);
  expect(assistantText(await session.confirm(pending.confirmationId, true))).toBe(
    "Bookmarked question 12.",
  );
  expect(bookmarks.get("student-1")).toEqual(new Set([12]));
  expect(assistantText(await session.turn("list bookmarks"))).toBe("Your bookmarks: 12.");
});

it("uses page context for a bookmark and leaves a rejected bookmark unsaved", async () => {
  const { handler, bookmarks } = setup();
  const session = await startSession(handler, { headers: await cookie("student-2") });
  const pending = confirmation(
    await session.turn("bookmark this question", {
      context: { path: "/questions/7", data: { questionId: 7 } },
    }),
  );
  expect(pending.args).toEqual({ questionId: 7 });
  expect(assistantText(await session.confirm(pending.confirmationId, false))).toBe(
    "The bookmark was not saved.",
  );
  expect(bookmarks.has("student-2")).toBe(false);
});

it("returns a safe sign-in error after anonymous bookmark approval", async () => {
  const { handler, bookmarks } = setup();
  const session = await startSession(handler);
  const pending = confirmation(await session.turn("bookmark question 12"));
  const events = await session.confirm(pending.confirmationId, true);
  expect(events).toContainEqual(
    expect.objectContaining({ type: "tool.finished", ok: false, errorCode: "FORBIDDEN" }),
  );
  expect(assistantText(events)).toContain("Sign in to bookmark questions.");
  expect(bookmarks.size).toBe(0);
});

it("authorizes the audit API only for the demo admin", async () => {
  const { handler } = setup();
  const student = await cookie("student-1");
  const session = await startSession(handler, { headers: student });
  const path = "/api/speeq/audit/sessions";
  expect((await handler(jsonRequest(path))).status).toBe(403);
  expect((await handler(jsonRequest(path, { headers: student }))).status).toBe(403);
  const response = await handler(jsonRequest(path, { headers: await cookie("admin") }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    sessions: [{ id: session.sessionId, userId: "student-1" }],
  });
});

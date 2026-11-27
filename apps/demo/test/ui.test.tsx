// @vitest-environment jsdom

import { createSpeeqClient } from "@speeq/client";
import { type SessionSummary, type UseSpeeqResult, useSpeeq } from "@speeq/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AuditBrowser } from "../components/audit-browser";
import { Widget } from "../components/widget";
import { canViewAudit } from "../lib/audit-access";
import { DEMO_USERS } from "../lib/demo-auth";

vi.mock(import("@speeq/react"), async (load) => ({
  ...(await load()),
  useSpeeq: vi.fn(),
}));

const sendText = vi.fn<UseSpeeqResult["sendText"]>(async () => {});
const confirm = vi.fn<UseSpeeqResult["confirm"]>(async () => {});
const startListening = vi.fn();
const stopListening = vi.fn();
const setLanguage = vi.fn();
const cancel = vi.fn();
const client = createSpeeqClient({ endpoint: "/api/speeq" });
const snapshot: UseSpeeqResult = {
  ...client.getSnapshot(),
  languages: ["en-IN", "te-IN", "hi-IN"],
  client,
  sendText,
  startListening,
  stopListening,
  startCall: vi.fn(),
  endCall: vi.fn(),
  cancel,
  setLanguage,
  confirm,
  resolveUiAction: vi.fn(async () => {}),
  speak: vi.fn(async () => {}),
};

beforeAll(() => {
  // jsdom lacks native dialog methods. Chromium exercises the actual modal in the e2e test.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSpeeq).mockReturnValue(snapshot);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openWidget(patch: Partial<UseSpeeqResult> = {}) {
  vi.mocked(useSpeeq).mockReturnValue({ ...snapshot, ...patch });
  const view = render(<Widget llmMode="mock" />);
  fireEvent.click(screen.getByTestId("assistant-toggle"));
  return view;
}

it("starts closed and updates the launcher state when toggled", () => {
  render(<Widget llmMode="mock" />);
  const toggle = screen.getByTestId("assistant-toggle");
  const panel = screen.getByTestId("assistant-panel");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(panel.hidden).toBe(true);
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(panel.hidden).toBe(false);
  fireEvent.click(toggle);
  expect(panel.hidden).toBe(true);
});

it("submits through the form used by Enter, clears the input and blocks blank or thinking sends", () => {
  const view = openWidget();
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Message" });
  const send = screen.getByRole<HTMLButtonElement>("button", { name: "Send" });
  expect(send.disabled).toBe(true);
  fireEvent.change(input, { target: { value: "   " } });
  expect(send.disabled).toBe(true);
  fireEvent.change(input, { target: { value: "  Hello Vidya " } });
  expect(send.disabled).toBe(false);
  act(() => input.form?.requestSubmit());
  expect(sendText).toHaveBeenCalledExactlyOnceWith("Hello Vidya");
  expect(input.value).toBe("");

  vi.mocked(useSpeeq).mockReturnValue({ ...snapshot, state: "thinking" });
  view.rerender(<Widget llmMode="mock" />);
  fireEvent.change(input, { target: { value: "Another message" } });
  expect(send.disabled).toBe(true);
  act(() => input.form?.requestSubmit());
  expect(sendText).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(cancel).toHaveBeenCalledOnce();
});

it("disables unsupported voice input and toggles listening when available", () => {
  const view = openWidget();
  const mic = screen.getByRole<HTMLButtonElement>("button", { name: "Microphone" });
  expect(mic.disabled).toBe(true);
  expect(
    screen.getByText("Voice input isn't supported in this browser. Type instead."),
  ).toBeTruthy();
  const support = { ...snapshot.support, speechInput: true, voiceForLanguage: false };
  vi.mocked(useSpeeq).mockReturnValue({ ...snapshot, support });
  view.rerender(<Widget llmMode="mock" />);
  expect(mic.disabled).toBe(false);
  fireEvent.click(mic);
  expect(startListening).toHaveBeenCalledOnce();

  vi.mocked(useSpeeq).mockReturnValue({
    ...snapshot,
    support,
    state: "listening",
    interimTranscript: "take me",
  });
  view.rerender(<Widget llmMode="mock" />);
  expect(mic.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("log").textContent).toContain("take me");
  fireEvent.click(mic);
  expect(stopListening).toHaveBeenCalledOnce();

  const language = screen.getByRole<HTMLSelectElement>("combobox", { name: "Language" });
  expect(language.value).toBe("en-IN");
  expect(Array.from(language.options, (option) => option.label)).toEqual([
    "English",
    "తెలుగు",
    "हिन्दी",
  ]);
  expect(
    screen.getByText("No voice is installed for this language. Replies still appear as text."),
  ).toBeTruthy();
  fireEvent.change(language, { target: { value: "te-IN" } });
  expect(setLanguage).toHaveBeenCalledExactlyOnceWith("te-IN");
});

function openConfirmation() {
  openWidget({
    pendingConfirmation: {
      confirmationId: "c12",
      toolName: "bookmark_question",
      summary: "Bookmark question 12?",
      args: { questionId: 12 },
    },
  });
}

it("starts focus on Decline, traps Tab, and sends only one approval on a double-click", () => {
  openConfirmation();
  const dialog = screen.getByRole("dialog", { name: "Confirm action" });
  expect(dialog.textContent).toContain("Bookmark question 12?");
  const approve = screen.getByRole("button", { name: "Approve" });
  const decline = screen.getByRole("button", { name: "Decline" });
  expect(document.activeElement).toBe(decline);
  fireEvent.keyDown(decline, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(approve);
  fireEvent.keyDown(approve, { key: "Tab" });
  expect(document.activeElement).toBe(decline);
  fireEvent.click(approve);
  fireEvent.click(approve);
  expect(confirm).toHaveBeenCalledExactlyOnceWith("c12", true);
});

it.each(["Decline", "Escape"])("declines via %s", (action) => {
  openConfirmation();
  const decline = screen.getByRole("button", { name: "Decline" });
  if (action === "Escape") fireEvent.keyDown(decline, { key: action });
  else fireEvent.click(decline);
  expect(confirm).toHaveBeenCalledExactlyOnceWith("c12", false);
});

it("shows only the public network error and lets the user send again", () => {
  const error = {
    code: "INTERNAL" as const,
    message: "Could not reach the server.",
    retryable: true,
    cause: "private stack trace",
  };
  openWidget({ state: "error", error });
  expect(screen.getByRole("alert").textContent).toBe(
    "Could not reach the server. Try sending your message again.",
  );
  expect(screen.queryByText(error.cause)).toBeNull();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Retry" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(sendText).toHaveBeenCalledExactlyOnceWith("Retry");
});

it("shows the badge only in mock mode", () => {
  const view = openWidget();
  expect(screen.getByTestId("assistant-mock-badge").textContent).toBe("Mock mode");
  view.rerender(<Widget llmMode="groq" />);
  expect(screen.queryByTestId("assistant-mock-badge")).toBeNull();
  view.rerender(<Widget llmMode="gemini" />);
  expect(screen.queryByTestId("assistant-mock-badge")).toBeNull();
});

const summary: SessionSummary = {
  id: "session-1",
  userId: null,
  startedAt: "2026-01-02T03:04:05.000Z",
  lastEventAt: "2026-01-02T03:04:05.000Z",
  language: "en-IN",
  eventCount: 1,
  turnCount: 1,
  toolCallCount: 0,
  navigationCount: 0,
  errorCount: 0,
};

it("loads session pages and safely renders an unfamiliar audit event", async () => {
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith("/session-1"))
      return Response.json({
        session: summary,
        events: [{ id: "event-1", type: "future.event", ts: summary.startedAt }],
      });
    if (String(url).includes("cursor=next"))
      return Response.json({ sessions: [], nextCursor: null });
    return Response.json({ sessions: [summary], nextCursor: "next" });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<AuditBrowser />);
  expect(screen.getByRole("status").textContent).toContain("Loading sessions");
  const row = await screen.findByTestId("audit-session-row");
  expect(row.textContent).toContain("anonymous");
  expect(row.textContent).toContain("en-IN · 1 turn");
  const loadMore = screen.getByTestId("audit-load-more");
  fireEvent.click(loadMore);
  fireEvent.click(row);
  const timeline = await screen.findByTestId("audit-timeline");
  expect(timeline.textContent).toContain("future.event");
  expect(screen.queryByTestId("audit-load-more")).toBeNull();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/speeq/audit/sessions?cursor=next",
    expect.objectContaining({ credentials: "include" }),
  );
});

it("shows an audit error and provides refresh", async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new Error("private connection failure"))
    .mockResolvedValueOnce(Response.json({ sessions: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetcher);
  render(<AuditBrowser />);
  expect((await screen.findByRole("alert")).textContent).toBe("Could not reach the server.");
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("No conversations yet.")).toBeTruthy();
  expect(screen.queryByTestId("audit-load-more")).toBeNull();
});

it("allows only the admin account to view audit history", () => {
  expect(canViewAudit(null)).toBe(false);
  for (const user of DEMO_USERS) expect(canViewAudit(user)).toBe(user.id === "admin");
});

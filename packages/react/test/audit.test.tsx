import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAuditSession, useAuditSessions } from "../src/index.js";

afterEach(cleanup);
const endpoint = "/api";
function page(id: string, nextCursor: string | null = null) {
  return Response.json({ sessions: [{ id }], nextCursor });
}

it("loads and appends pages, resets filters, refreshes and reports 403", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(page("first", "next +"))
    .mockResolvedValueOnce(page("second"))
    .mockResolvedValueOnce(page("filter result"))
    .mockResolvedValueOnce(page("refreshed"))
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: "FORBIDDEN", message: "Denied", retryable: false } },
        { status: 403 },
      ),
    );
  const { result, rerender } = renderHook(
    ({ userId }: { userId?: string }) => useAuditSessions({ endpoint, fetch, filter: { userId } }),
    { initialProps: { userId: undefined } as { userId?: string } },
  );
  await waitFor(() =>
    expect(result.current.sessions.map((session) => session.id)).toEqual(["first"]),
  );
  expect(result.current.hasMore).toBe(true);
  act(() => {
    result.current.loadMore();
    result.current.loadMore();
  });
  await waitFor(() =>
    expect(result.current.sessions.map((session) => session.id)).toEqual(["first", "second"]),
  );
  expect(fetch.mock.calls[1]?.[0]).toBe("/api/audit/sessions?cursor=next+%2B");
  expect(result.current.hasMore).toBe(false);
  rerender({ userId: "alice" });
  expect(result.current.sessions).toEqual([]);
  await waitFor(() => expect(result.current.sessions[0]?.id).toBe("filter result"));
  expect(fetch.mock.calls[2]?.[0]).toBe("/api/audit/sessions?userId=alice");
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.sessions[0]?.id).toBe("refreshed"));
  rerender({ userId: "bob" });
  await waitFor(() =>
    expect(result.current.error).toMatchObject({ code: "FORBIDDEN", message: "Denied" }),
  );
  expect(result.current.loading).toBe(false);
});

it("aborts superseded list requests and ignores late responses after changes or unmount", async () => {
  const pending: Array<{ signal?: AbortSignal | null; resolve: (response: Response) => void }> = [];
  const fetch = vi.fn<typeof globalThis.fetch>(
    (_, init) =>
      new Promise<Response>((resolve) => pending.push({ signal: init?.signal, resolve })),
  );
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { result, rerender, unmount } = renderHook(
      ({ userId }) => useAuditSessions({ endpoint, fetch, filter: { userId } }),
      { initialProps: { userId: "old" } },
    );
    rerender({ userId: "current" });
    expect(pending[0]?.signal?.aborted).toBe(true);
    await act(async () => {
      pending[1]?.resolve(page("current"));
    });
    await act(async () => {
      pending[0]?.resolve(page("old"));
    });
    expect(result.current.sessions[0]?.id).toBe("current");
    act(() => result.current.refresh());
    unmount();
    expect(pending[2]?.signal?.aborted).toBe(true);
    await act(async () => {
      pending[2]?.resolve(page("after unmount"));
    });
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});

it("loads a selected session and refreshes its events while a null selection stays empty", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ session: { id: "a/b" }, events: [{ seq: 0 }] }))
    .mockResolvedValueOnce(
      Response.json({ session: { id: "a/b" }, events: [{ seq: 0 }, { seq: 1 }] }),
    );
  const { result, rerender } = renderHook(
    ({ id }: { id: string | null }) => useAuditSession(id, { endpoint, fetch }),
    { initialProps: { id: null } as { id: string | null } },
  );
  expect(result.current).toMatchObject({ session: null, events: [], loading: false, error: null });
  expect(fetch).not.toHaveBeenCalled();
  rerender({ id: "a/b" });
  await waitFor(() => expect(result.current.events).toEqual([{ seq: 0 }]));
  expect(fetch.mock.lastCall?.[0]).toBe("/api/audit/sessions/a%2Fb");
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.events).toHaveLength(2));
  rerender({ id: null });
  expect(result.current).toMatchObject({ session: null, events: [], loading: false, error: null });
  expect(fetch).toHaveBeenCalledTimes(2);
});

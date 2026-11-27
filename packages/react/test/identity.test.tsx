import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SpeeqProvider, useSpeeqIdentity } from "../src/index.js";

afterEach(cleanup);

it("useSpeeqIdentity follows the server's identity and its changes", async () => {
  let who = { state: "anonymous", fingerprint: "anonymous" };
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ protocolVersion: 1, identity: who }),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SpeeqProvider endpoint="/api/speeq" fetch={fetch}>
      {children}
    </SpeeqProvider>
  );
  const { result } = renderHook(useSpeeqIdentity, { wrapper });
  expect(result.current.identity).toBeNull();
  await act(() => result.current.refresh());
  expect(result.current.identity).toEqual(who);
  who = { state: "authenticated", fingerprint: "fp-ravi" };
  await act(() => result.current.refresh());
  await waitFor(() => expect(result.current.identity?.fingerprint).toBe("fp-ravi"));
  expect(fetch.mock.calls.every(([url]) => String(url) === "/api/speeq/identity")).toBe(true);
});

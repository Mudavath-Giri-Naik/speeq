import type { AgentContext } from "@speeq/core";
import { describe, expect, it, vi } from "vitest";
import { bindEndpoint, type EndpointBindingOptions } from "../src/endpoint.js";

const BASE = "https://app.example.com";
function ctx(headers: Record<string, string> = {}, signal = new AbortController().signal) {
  return {
    user: null,
    session: { id: "s" },
    request: new Request("https://app.example.com/api/speeq/chat", { headers }),
    signal,
    language: "en-IN",
    pageContext: undefined,
  } as unknown as AgentContext;
}
function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}
function setup(
  over: Partial<EndpointBindingOptions> = {},
  reply: () => Response = () => json({ ok: 1 }),
) {
  const fetchMock = vi.fn(async (_url: URL | string, _init?: RequestInit) => reply());
  const run = bindEndpoint({
    baseUrl: BASE,
    method: "GET",
    path: "/api/items/:id",
    fetch: fetchMock as unknown as typeof fetch,
    ...over,
  });
  return { run, fetchMock };
}
const call = (fetchMock: ReturnType<typeof setup>["fetchMock"]) => {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  return { url: String(url), init: init as RequestInit };
};

describe("bindEndpoint configuration", () => {
  it.each([
    "api/items",
    "//evil.com/x",
    "/api/../admin",
    "/api/./x",
    "/api/%2e%2e/x",
    "/api\\x",
    "/api/x?y=1",
    "/api/x#h",
    "https://evil.com/x",
    "/api//x",
    "/api/x/",
    "/api/:",
    "/api/:1a",
    "/a\u0000b",
  ])("rejects path %j", (path) => {
    expect(() => bindEndpoint({ baseUrl: BASE, method: "GET", path })).toThrow();
  });
  it.each([
    "/rel",
    "http://example.com",
    "ftp://example.com",
    "https://user:pw@example.com",
    "https://example.com/base",
    "https://example.com/?x=1",
  ])("rejects baseUrl %j", (baseUrl) => {
    expect(() => bindEndpoint({ baseUrl, method: "GET", path: "/x" })).toThrow();
  });
  it("allows http only on loopback", () => {
    for (const baseUrl of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])
      expect(() => bindEndpoint({ baseUrl, method: "GET", path: "/x" })).not.toThrow();
  });
  it("rejects a query key that repeats a path parameter", () => {
    expect(() =>
      bindEndpoint({ baseUrl: BASE, method: "GET", path: "/x/:id", query: ["id"] }),
    ).toThrow();
  });
});

describe("bindEndpoint requests", () => {
  it("fills path parameters with encoding and stays on origin", async () => {
    const { run, fetchMock } = setup();
    await expect(run({ id: "a b" }, ctx())).resolves.toEqual({ ok: 1 });
    expect(call(fetchMock).url).toBe("https://app.example.com/api/items/a%20b");
    expect(call(fetchMock).init.redirect).toBe("manual");
  });
  it.each(["..", ".", "a/b", "a\\b", "", "x\u0000", "x".repeat(201)])(
    "rejects path value %j",
    async (id) => {
      const { run, fetchMock } = setup();
      await expect(run({ id }, ctx())).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("rejects missing and object path values", async () => {
    const { run } = setup();
    await expect(run({}, ctx())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(run({ id: { a: 1 } }, ctx())).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("sends declared query keys, arrays, and rejects unknown keys for GET", async () => {
    const { run, fetchMock } = setup({ path: "/api/items", query: ["q", "tag"] });
    await run({ q: "a&b", tag: ["x", "y"], skip: undefined }, ctx());
    expect(call(fetchMock).url).toBe("https://app.example.com/api/items?q=a%26b&tag=x&tag=y");
    await expect(run({ other: 1 }, ctx())).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("sends the remaining keys as JSON for non-GET methods", async () => {
    const { run, fetchMock } = setup({ method: "POST", path: "/api/items", query: ["dry"] });
    await run({ dry: true, name: "x", n: 2 }, ctx());
    const { url, init } = call(fetchMock);
    expect(url).toBe("https://app.example.com/api/items?dry=true");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"name":"x","n":2}');
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });
  it("forwards no credentials by default", async () => {
    const { run, fetchMock } = setup();
    await run({ id: "1" }, ctx({ cookie: "a=1", authorization: "Bearer t", "x-other": "z" }));
    const h = new Headers(call(fetchMock).init.headers);
    expect(h.get("cookie")).toBeNull();
    expect(h.get("authorization")).toBeNull();
  });
  it("forwards only cookie and authorization with forwardAuth", async () => {
    const { run, fetchMock } = setup({ forwardAuth: true });
    await run({ id: "1" }, ctx({ cookie: "a=1", authorization: "Bearer t", "x-other": "z" }));
    const h = new Headers(call(fetchMock).init.headers);
    expect(h.get("cookie")).toBe("a=1");
    expect(h.get("authorization")).toBe("Bearer t");
    expect(h.get("x-other")).toBeNull();
  });
});

describe("bindEndpoint responses", () => {
  it("refuses redirects without exposing the target", async () => {
    const { run } = setup(
      {},
      () =>
        new Response(null, { status: 302, headers: { location: "https://evil.example/secret" } }),
    );
    const error = (await run({ id: "1" }, ctx()).catch((e) => e)) as Error;
    expect(error).toMatchObject({ code: "TOOL_ERROR" });
    expect(error.message).not.toContain("evil");
  });
  it("reports status only, never the body", async () => {
    const { run } = setup({}, () => new Response("secret-body-token", { status: 500 }));
    const error = (await run({ id: "1" }, ctx()).catch((e) => e)) as Error;
    expect(error).toMatchObject({ code: "TOOL_ERROR" });
    expect(error.message).toContain("500");
    expect(error.message).not.toContain("secret");
  });
  it("aborts oversized bodies, declared or streamed", async () => {
    const declared = setup(
      { maxResponseBytes: 10 },
      () => new Response("x".repeat(50), { headers: { "content-length": "50" } }),
    );
    await expect(declared.run({ id: "1" }, ctx())).rejects.toMatchObject({ code: "TOOL_ERROR" });
    const streamed = setup(
      { maxResponseBytes: 10 },
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(8));
              c.enqueue(new Uint8Array(8));
              c.close();
            },
          }),
        ),
    );
    await expect(streamed.run({ id: "1" }, ctx())).rejects.toMatchObject({ code: "TOOL_ERROR" });
  });
  it("times out", async () => {
    const run = bindEndpoint({
      baseUrl: BASE,
      method: "GET",
      path: "/x",
      timeoutMs: 20,
      fetch: ((_u: unknown, init?: RequestInit) =>
        new Promise((_res, rej) =>
          init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))),
        )) as unknown as typeof fetch,
    });
    await expect(run({}, ctx())).rejects.toMatchObject({ code: "TOOL_TIMEOUT" });
  });
  it("propagates the caller's abort as a tool error", async () => {
    const ac = new AbortController();
    ac.abort();
    const run = bindEndpoint({
      baseUrl: BASE,
      method: "GET",
      path: "/x",
      fetch: ((_u: unknown, init?: RequestInit) =>
        init?.signal?.aborted
          ? Promise.reject(new Error("x"))
          : Promise.resolve(json({}))) as unknown as typeof fetch,
    });
    await expect(run({}, ctx({}, ac.signal))).rejects.toMatchObject({ code: "TOOL_ERROR" });
  });
  it("returns null for 204, text for non-JSON and errors on invalid JSON", async () => {
    expect(
      await setup({}, () => new Response(null, { status: 204 })).run({ id: "1" }, ctx()),
    ).toBeNull();
    expect(await setup({}, () => new Response("hello")).run({ id: "1" }, ctx())).toBe("hello");
    await expect(
      setup({}, () => new Response("{", { headers: { "content-type": "application/json" } })).run(
        { id: "1" },
        ctx(),
      ),
    ).rejects.toMatchObject({ code: "TOOL_ERROR" });
  });
});

import { createMemoryStore } from "@speeq/store-memory";
import { FakeLLMProvider } from "@speeq/testing";
import { afterEach, expect, it, vi } from "vitest";
import { checkForUpdate, compareVersions } from "../src/update-check";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([
  ["0.1.0", "0.2.0", -1],
  ["1.0.0-next.1", "1.0.0", -1],
  ["1.0.0", "1.0.0+build.5", 0],
  ["0.10.0", "0.9.0", 1],
  ["1.0.0-next.10", "1.0.0-next.2", 1],
  ["invalid", "1.0.0", 0],
  ["1.0.0-alpha..1", "1.0.0", 0],
] as const)("compares %s to %s", (a, b, expected) => expect(compareVersions(a, b)).toBe(expected));

const options = { currentVersion: "0.1.0", enabled: true, env: {} };
it.each([
  ["0.1.0", { next: "0.2.0", latest: "1.0.0" }, "next", "0.2.0"],
  ["1.0.0-beta.2", { next: "1.0.0", latest: "2.0.0" }, "next", "1.0.0"],
  ["0.1.0", { latest: "1.0.0" }, "latest", "1.0.0"],
  ["1.0.0", { next: "3.0.0", latest: "2.0.0" }, "latest", "2.0.0"],
] as const)("checks the proper channel for %s", async (currentVersion, tags, tag, newer) => {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(tags)),
    log = vi.fn();
  await checkForUpdate({ ...options, currentVersion, fetchImpl, log });
  expect(log.mock.calls).toEqual([
    [`[speeq] Update available: ${currentVersion} -> ${newer}. Run: npm i speeq@${tag}`],
  ]);
  expect(fetchImpl.mock.calls).toEqual([
    [
      "https://registry.npmjs.org/-/package/speeq/dist-tags",
      { signal: expect.any(AbortSignal), credentials: "omit", redirect: "error" },
    ],
  ]);
});

it.each([
  { env: { NODE_ENV: "production" } },
  { env: { CI: "" } },
  { env: { SPEEQ_UPDATE_CHECK: "0" } },
  { env: { SPEEQ_TELEMETRY: "0" } },
  { enabled: false },
  { env: { NEXT_RUNTIME: "edge" } },
])("skips before fetch for %o", async (overrides) => {
  const fetchImpl = vi.fn<typeof fetch>();
  await checkForUpdate({ ...options, ...overrides, fetchImpl });
  expect(fetchImpl).not.toHaveBeenCalled();
});

it.each([
  () => Response.json({ next: "0.1.0" }),
  () => Response.json({ next: "0.0.9" }),
  () => Response.json({ next: 7, latest: "1.0.0" }),
  () => new Response("{"),
  () => new Response(null, { status: 503 }),
  () => {
    throw Error("offline");
  },
])("stays silent on unusable results", async (response) => {
  const log = vi.fn();
  await checkForUpdate({ ...options, fetchImpl: async () => response(), log });
  expect(log).not.toHaveBeenCalled();
});

it("silently handles the two-second deadline", async () => {
  const controller = new AbortController();
  const clock = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  const log = vi.fn();
  const done = checkForUpdate({
    ...options,
    log,
    fetchImpl: async (_, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () => reject(Error("timeout"))),
      ),
  });
  expect(clock).toHaveBeenCalledWith(2000);
  controller.abort();
  await done;
  expect(log).not.toHaveBeenCalled();
});

it("absorbs logger failures", async () => {
  await expect(
    checkForUpdate({
      ...options,
      fetchImpl: async () => Response.json({ next: "1.0.0" }),
      log: () => {
        throw Error("logger");
      },
    }),
  ).resolves.toBeUndefined();
});

it.each([true, false, undefined])(
  "creates handlers synchronously with updateCheck=%s",
  async (enabled) => {
    vi.resetModules();
    for (const key of ["CI", "SPEEQ_TELEMETRY", "SPEEQ_UPDATE_CHECK", "NEXT_RUNTIME"])
      vi.stubEnv(key, undefined);
    vi.stubEnv("NODE_ENV", "development");
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchImpl);
    const { createSpeeq } = await import("../src/index");
    const config = {
      agent: { name: "Test", instructions: "Help." },
      store: createMemoryStore({ quiet: true }),
      llm: new FakeLLMProvider([]),
      updateCheck: enabled,
    };
    expect(createSpeeq(config).handler).toBeTypeOf("function");
    expect(createSpeeq(config).handler).toBeTypeOf("function");
    expect(fetchImpl).toHaveBeenCalledTimes(enabled === false ? 0 : 1);
  },
);

it("rejects a non-boolean updateCheck in untyped configuration", async () => {
  const { resolveUpdateCheck } = await import("../src/config");
  expect(() => resolveUpdateCheck("false")).toThrow(/boolean/);
});

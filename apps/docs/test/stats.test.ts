import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clampRangeStart,
  formatCount,
  getSiteStats,
  parseDownloadsPoint,
  parseDownloadsRange,
  parseRegistry,
  sumDownloads,
} from "../lib/stats";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("parsers", () => {
  it("reads a point response", () => {
    expect(parseDownloadsPoint({ downloads: 42, package: "speeq" })).toBe(42);
    expect(parseDownloadsPoint({ downloads: 0 })).toBe(0);
  });

  it("returns null for bad point responses", () => {
    for (const bad of [
      null,
      undefined,
      "x",
      [],
      {},
      { downloads: "5" },
      { downloads: -1 },
      { downloads: Number.NaN },
    ]) {
      expect(parseDownloadsPoint(bad)).toBeNull();
    }
  });

  it("reads a range response, sorted, skipping bad rows", () => {
    const points = parseDownloadsRange({
      downloads: [
        { day: "2026-11-27", downloads: 3 },
        { day: "2026-11-26", downloads: 5 },
        { day: "bad", downloads: 1 },
        { day: "2026-11-28" },
        null,
      ],
    });
    expect(points).toEqual([
      { day: "2026-11-26", downloads: 5 },
      { day: "2026-11-27", downloads: 3 },
    ]);
    expect(parseDownloadsRange({})).toEqual([]);
    expect(parseDownloadsRange(null)).toEqual([]);
  });

  it("reads the registry document", () => {
    const parsed = parseRegistry({
      "dist-tags": { latest: "0.2.0", next: "0.2.0" },
      time: {
        created: "2026-11-25T00:00:00Z",
        modified: "x",
        "0.0.0-stage": "2026-11-25T20:53:00Z",
        "0.2.0": "2026-11-25T21:00:00Z",
      },
    });
    expect(parsed.latest).toBe("0.2.0");
    expect(parsed.next).toBe("0.2.0");
    expect(parsed.releases.map((r) => r.version)).toEqual(["0.2.0", "0.0.0-stage"]);
    expect(parsed.lastPublished).toBe("2026-11-25T21:00:00Z");
    expect(parseRegistry(null).releases).toEqual([]);
  });

  it("sums downloads from a start day", () => {
    const points = [
      { day: "2026-11-20", downloads: 100 },
      { day: "2026-11-25", downloads: 2 },
      { day: "2026-11-26", downloads: 3 },
    ];
    expect(sumDownloads(points)).toBe(5);
    expect(sumDownloads(points, "2026-11-20")).toBe(105);
  });

  it("clamps the range start to 18 months", () => {
    const now = new Date("2028-06-15T00:00:00Z");
    expect(clampRangeStart("2026-11-25", now) > "2026-11-25").toBe(true);
    expect(clampRangeStart("2028-01-01", now)).toBe("2028-01-01");
  });

  it("formats numbers", () => {
    expect(formatCount(null)).toBe("–");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(12_345, true)).toBe("12.3k");
  });
});

describe("getSiteStats failure behavior", () => {
  it("never throws and returns nulls when offline", async () => {
    vi.stubEnv("DOCS_STATS_OFFLINE", "1");
    const stats = await getSiteStats();
    expect(stats.packages).toHaveLength(10);
    expect(stats.packages.every((p) => p.week === null && p.version === null)).toBe(true);
    expect(stats.speeqAllTime).toBeNull();
    expect(stats.totalWeek).toBeNull();
    expect(stats.github).toBeNull();
    expect(stats.speeqDaily30).toEqual([]);
  });

  it("survives network errors, non-200s and invalid JSON", async () => {
    const calls = [
      () => Promise.reject(new Error("offline")),
      () => Promise.resolve(new Response("nope", { status: 500 })),
      () => Promise.resolve(new Response("{not json", { status: 200 })),
    ];
    for (const make of calls) {
      vi.stubGlobal("fetch", vi.fn(make));
      const stats = await getSiteStats();
      expect(stats.packages).toHaveLength(10);
      expect(stats.packages[0]?.week).toBeNull();
    }
  });

  it("reports zero downloads as 0, not missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/downloads/point/")
          ? Response.json({ downloads: 0 })
          : new Response("no", { status: 404 }),
      ),
    );
    const stats = await getSiteStats();
    expect(stats.packages[0]?.week).toBe(0);
    expect(stats.totalWeek).toBe(0);
  });

  it("treats a 404 from the npm download API as zero installs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "package speeq not found" }, { status: 404 })),
    );
    const stats = await getSiteStats();
    expect(stats.packages[0]?.week).toBe(0);
    expect(stats.speeqAllTime).toBe(0);
    expect(stats.speeqDaily30).toEqual([]);
    // the registry itself is not a download endpoint, so a 404 there stays unknown
    expect(stats.packages[0]?.version).toBeNull();
  });

  it("sends the GitHub token only to GitHub and never returns it", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_secret_token_value");
    const seen: { url: string; auth: string | undefined }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        seen.push({ url, auth: headers.authorization });
        return url.includes("api.github.com")
          ? Response.json({ stargazers_count: 7, forks_count: 2 })
          : new Response("no", { status: 404 });
      }),
    );
    const stats = await getSiteStats();
    expect(stats.github?.stars).toBe(7);
    expect(JSON.stringify(stats)).not.toContain("ghp_secret_token_value");
    for (const call of seen) {
      if (call.url.includes("api.github.com"))
        expect(call.auth).toBe("Bearer ghp_secret_token_value");
      else expect(call.auth).toBeUndefined();
    }
  });
});

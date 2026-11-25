import { REPO } from "./site";

export const PACKAGES = [
  { name: "speeq", purpose: "Everything in one package, with small import paths" },
  { name: "@speeq/core", purpose: "Shared types, message shapes and errors" },
  { name: "@speeq/server", purpose: "The handler, tools, routes, confirmations and audit" },
  { name: "@speeq/client", purpose: "Browser state, streaming and speech" },
  { name: "@speeq/react", purpose: "The React provider and hooks" },
  { name: "@speeq/testing", purpose: "Fake model, speech doubles and test helpers" },
  { name: "@speeq/llm-openai-compatible", purpose: "Groq and other OpenAI-style models" },
  { name: "@speeq/llm-gemini", purpose: "Google Gemini models" },
  { name: "@speeq/store-memory", purpose: "A store for local development" },
  { name: "@speeq/store-mongodb", purpose: "A MongoDB conversation store" },
] as const;

/** The day the first version was published to npm. Download history starts here. */
export const FIRST_PUBLISH = "2026-11-25";

export interface PackageStats {
  name: string;
  purpose: string;
  version: string | null;
  nextVersion: string | null;
  lastPublished: string | null;
  day: number | null;
  week: number | null;
  month: number | null;
}
export interface DailyPoint {
  day: string;
  downloads: number;
}
export interface SiteStats {
  fetchedAt: string;
  packages: PackageStats[];
  speeqDaily30: DailyPoint[];
  speeqAllTime: number | null;
  totalWeek: number | null;
  github: {
    stars: number | null;
    forks: number | null;
    openIssues: number | null;
    watchers: number | null;
    license: string | null;
    pushedAt: string | null;
  } | null;
  releases: { version: string; date: string }[];
}

const NO_DOWNLOADS = { downloads: 0 };
const NO_RANGE = { downloads: [] };
const TIMEOUT_MS = 5000;
const REVALIDATE = 3600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Fetch JSON. Any failure returns null. If `whenMissing` is given, a 404 returns it instead:
 * npm answers 404 for download counts of a package that has no download history yet.
 */
async function getJson(
  url: string,
  headers?: Record<string, string>,
  whenMissing?: unknown,
): Promise<unknown | null> {
  if (process.env.DOCS_STATS_OFFLINE === "1") return null;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE },
    });
    if (response.status === 404 && whenMissing !== undefined) return whenMissing;
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** The `downloads` field of an npm point response, or null. */
export function parseDownloadsPoint(json: unknown): number | null {
  return isRecord(json) ? num(json.downloads) : null;
}

/** Daily points from an npm range response, oldest first. Anything malformed is skipped. */
export function parseDownloadsRange(json: unknown): DailyPoint[] {
  if (!isRecord(json) || !Array.isArray(json.downloads)) return [];
  const points: DailyPoint[] = [];
  for (const item of json.downloads) {
    if (!isRecord(item)) continue;
    const day = str(item.day);
    const downloads = num(item.downloads);
    if (day && downloads !== null && /^\d{4}-\d{2}-\d{2}$/.test(day))
      points.push({ day, downloads });
  }
  return points.sort((a, b) => a.day.localeCompare(b.day));
}

/** Release list (newest first) and tags from an npm registry document. */
export function parseRegistry(json: unknown): {
  latest: string | null;
  next: string | null;
  lastPublished: string | null;
  releases: { version: string; date: string }[];
} {
  const empty = { latest: null, next: null, lastPublished: null, releases: [] };
  if (!isRecord(json)) return empty;
  const tags = isRecord(json["dist-tags"]) ? json["dist-tags"] : {};
  const time = isRecord(json.time) ? json.time : {};
  const releases = Object.entries(time)
    .filter(([version, date]) => /^\d+\.\d+\.\d+/.test(version) && typeof date === "string")
    .map(([version, date]) => ({ version, date: date as string }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return {
    latest: str(tags.latest),
    next: str(tags.next),
    lastPublished: releases[0]?.date ?? null,
    releases,
  };
}

/** Sum a range response, ignoring days before `from` (YYYY-MM-DD). */
export function sumDownloads(points: DailyPoint[], from: string = FIRST_PUBLISH): number {
  return points.filter((p) => p.day >= from).reduce((sum, p) => sum + p.downloads, 0);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** npm allows at most 18 months per range, so clamp the start. */
export function clampRangeStart(from: string, now: Date = new Date()): string {
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() - 17);
  const floor = limit.toISOString().slice(0, 10);
  return from < floor ? floor : from;
}

async function packageStats(name: string, purpose: string): Promise<PackageStats> {
  const base = "https://api.npmjs.org/downloads/point";
  const [day, week, month, registry] = await Promise.all([
    getJson(`${base}/last-day/${name}`, undefined, NO_DOWNLOADS),
    getJson(`${base}/last-week/${name}`, undefined, NO_DOWNLOADS),
    getJson(`${base}/last-month/${name}`, undefined, NO_DOWNLOADS),
    getJson(`https://registry.npmjs.org/${name}`),
  ]);
  const parsed = parseRegistry(registry);
  return {
    name,
    purpose,
    version: parsed.latest,
    nextVersion: parsed.next,
    lastPublished: parsed.lastPublished,
    day: parseDownloadsPoint(day),
    week: parseDownloadsPoint(week),
    month: parseDownloadsPoint(month),
  };
}

async function githubStats(): Promise<SiteStats["github"]> {
  const token = process.env.GITHUB_TOKEN;
  const json = await getJson(
    `https://api.github.com/repos/${REPO}`,
    token ? { authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" } : undefined,
  );
  if (!isRecord(json)) return null;
  const license = isRecord(json.license) ? str(json.license.spdx_id) : null;
  return {
    stars: num(json.stargazers_count),
    forks: num(json.forks_count),
    openIssues: num(json.open_issues_count),
    watchers: num(json.subscribers_count),
    license,
    pushedAt: str(json.pushed_at),
  };
}

/** Fetches everything. Never rejects. Any failed number is null. */
export async function getSiteStats(): Promise<SiteStats> {
  try {
    const rangeStart = clampRangeStart(FIRST_PUBLISH);
    const [packages, daily, allTime, github, registry] = await Promise.all([
      Promise.all(PACKAGES.map((p) => packageStats(p.name, p.purpose))),
      getJson("https://api.npmjs.org/downloads/range/last-month/speeq", undefined, NO_RANGE),
      getJson(
        `https://api.npmjs.org/downloads/range/${rangeStart}:${today()}/speeq`,
        undefined,
        NO_RANGE,
      ),
      githubStats(),
      getJson("https://registry.npmjs.org/speeq"),
    ]);
    const weeks = packages.map((p) => p.week).filter((n): n is number => n !== null);
    const allPoints = parseDownloadsRange(allTime);
    return {
      fetchedAt: new Date().toISOString(),
      packages,
      speeqDaily30: parseDownloadsRange(daily),
      speeqAllTime: isRecord(allTime) ? sumDownloads(allPoints) : null,
      totalWeek: weeks.length > 0 ? weeks.reduce((a, b) => a + b, 0) : null,
      github,
      releases: parseRegistry(registry).releases,
    };
  } catch {
    return {
      fetchedAt: new Date().toISOString(),
      packages: PACKAGES.map((p) => ({
        name: p.name,
        purpose: p.purpose,
        version: null,
        nextVersion: null,
        lastPublished: null,
        day: null,
        week: null,
        month: null,
      })),
      speeqDaily30: [],
      speeqAllTime: null,
      totalWeek: null,
      github: null,
      releases: [],
    };
  }
}

/** "1,234", "12.3k", or an em dash when unknown. */
export function formatCount(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined) return "–";
  if (compact && value >= 10_000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return value.toLocaleString("en-US");
}

/** Just the star count, for the header. Shares the cached GitHub request with getSiteStats. */
export async function getGithubStars(): Promise<number | null> {
  try {
    return (await githubStats())?.stars ?? null;
  } catch {
    return null;
  }
}

export interface QuickStats {
  version: string | null;
  week: number | null;
  month: number | null;
  allTime: number | null;
  stars: number | null;
  forks: number | null;
}

let quick: { at: number; value: Promise<QuickStats> } | null = null;

/**
 * Just the headline numbers, from five requests instead of fifty, for the voice assistant where
 * every second counts. Cached for ten minutes in the server process. Never rejects.
 */
export function getQuickStats(): Promise<QuickStats> {
  if (quick && Date.now() - quick.at < 10 * 60_000) return quick.value;
  const value = (async (): Promise<QuickStats> => {
    const base = "https://api.npmjs.org/downloads";
    const [week, month, range, registry, github] = await Promise.all([
      getJson(`${base}/point/last-week/speeq`, undefined, NO_DOWNLOADS),
      getJson(`${base}/point/last-month/speeq`, undefined, NO_DOWNLOADS),
      getJson(
        `${base}/range/${clampRangeStart(FIRST_PUBLISH)}:${today()}/speeq`,
        undefined,
        NO_RANGE,
      ),
      getJson("https://registry.npmjs.org/speeq"),
      githubStats(),
    ]);
    return {
      version: parseRegistry(registry).latest,
      week: parseDownloadsPoint(week),
      month: parseDownloadsPoint(month),
      allTime: isRecord(range) ? sumDownloads(parseDownloadsRange(range)) : null,
      stars: github?.stars ?? null,
      forks: github?.forks ?? null,
    };
  })().catch(() => ({
    version: null,
    week: null,
    month: null,
    allTime: null,
    stars: null,
    forks: null,
  }));
  quick = { at: Date.now(), value };
  return value;
}

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client";
import { externalStats } from "../db/schema";
import type { AdminSession } from "./auth/session";
import { setting } from "./env";
/** External metric with independent freshness and availability. */
export type Stat<T> =
  | { status: "ok"; value: T; stale: boolean }
  | { status: "unavailable" | "not-configured" };
const npmNames = ["@speeq/core", "@speeq/server", "@speeq/client", "@speeq/react"];
const count = z.number().int().nonnegative();
const npmResult = z.discriminatedUnion("published", [
  z.object({ published: z.literal(false) }),
  z.object({ published: z.literal(true), downloads: count }),
]);
const githubResult = z.object({ stars: count, forks: count });
async function responseJson(response: Response): Promise<unknown> {
  const limit = 100000;
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty response");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        throw new Error("Oversized response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
}
async function request(url: string) {
  return fetch(url, {
    method: "GET",
    headers: { accept: "application/json", "user-agent": "speeq-platform" },
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(3000),
  });
}
async function cached<T>(
  db: Db,
  key: string,
  shape: z.ZodType<T>,
  fetchValue: () => Promise<T>,
): Promise<Stat<T>> {
  let prior: T | undefined;
  try {
    const [entry] = await db.select().from(externalStats).where(eq(externalStats.key, key));
    const old = shape.safeParse(entry?.payload);
    if (old.success) prior = old.data;
    if (entry && Date.now() - entry.fetchedAt.getTime() < (entry.ok ? 360 : 15) * 60000)
      return prior === undefined
        ? { status: "unavailable" }
        : { status: "ok", value: prior, stale: !entry.ok };
    let value: T | undefined,
      ok = false;
    try {
      value = await fetchValue();
      ok = true;
    } catch {
      value = prior;
    }
    const row = { key, payload: value ?? {}, ok, fetchedAt: new Date() };
    await db
      .insert(externalStats)
      .values(row)
      .onConflictDoUpdate({ target: externalStats.key, set: row });
    return value === undefined ? { status: "unavailable" } : { status: "ok", value, stale: !ok };
  } catch {
    return prior === undefined
      ? { status: "unavailable" }
      : { status: "ok", value: prior, stale: true };
  }
}
/** Gets cached weekly npm downloads for the four SDK entry points. */
export function getNpmDownloads(db: Db, _session: AdminSession) {
  return Promise.all(
    npmNames.map(async (name) => ({
      name,
      stat: await cached(db, `npm:${name}`, npmResult, async () => {
        const r = await request(
          `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`,
        );
        if (r.status === 404) return { published: false as const };
        if (!r.ok) throw new Error("Unavailable");
        const { downloads } = z.object({ downloads: count }).parse(await responseJson(r));
        return { published: true as const, downloads };
      }),
    })),
  );
}
/** Reads only public star and fork counts for the configured repository. */
export async function getGithubStats(
  db: Db,
  _session: AdminSession,
): Promise<Stat<z.infer<typeof githubResult>>> {
  const repo = setting("GITHUB_REPO");
  if (!repo || !/^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})$/.test(repo))
    return { status: "not-configured" };
  return cached(db, `github:${repo}`, githubResult, async () => {
    const r = await request(`https://api.github.com/repos/${repo}`);
    if (!r.ok) throw new Error("Unavailable");
    const result = z
      .object({ stargazers_count: count, forks_count: count })
      .parse(await responseJson(r));
    return { stars: result.stargazers_count, forks: result.forks_count };
  });
}

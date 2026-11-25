import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Db } from "../../db/client";
import { setting } from "../env";
import { chargeBuckets } from "../ingest/throttle";
import { authConfig } from "./config";
import { createAdminToken } from "./session";
/** Selects a client identity only from explicitly trusted proxy headers. */
export function clientIp(headers: Pick<Headers, "get">) {
  if (setting("TRUST_PROXY_HEADERS") !== "1") return "unknown";
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
type Result =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid" | "throttled" | "disabled" | "unavailable" };
/** Charges the database limits before performing a bounded password check. */
export async function attemptLogin(
  input: { password: string; clientIp: string; now?: Date },
  deps: { db: Db | (() => Promise<Db>) },
): Promise<Result> {
  const start = performance.now();
  let throttled = false;
  try {
    const config = authConfig();
    if (!config) return { ok: false, reason: "disabled" };
    const db = typeof deps.db === "function" ? await deps.db() : deps.db;
    const hash = createHmac("sha256", config.secret)
      .update(input.clientIp)
      .digest("hex")
      .slice(0, 32);
    const retry = await chargeBuckets(
      db,
      input.now ?? new Date(),
      900000,
      new Map([
        ["login:global", 100],
        [`login:${hash}`, 8],
      ]),
    );
    if (retry) {
      throttled = true;
      return { ok: false, reason: "throttled" };
    }
    if (input.password.length > 256) return { ok: false, reason: "invalid" };
    const digest = (s: string) => createHash("sha256").update(s).digest();
    const password = input.password.endsWith("\n") ? input.password.slice(0, -1) : input.password;
    if (!timingSafeEqual(digest(password), digest(config.password)))
      return { ok: false, reason: "invalid" };
    return { ok: true, token: await createAdminToken(input.now) };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    if (!throttled) {
      const left = Math.ceil(300 - (performance.now() - start));
      if (left > 0) await delay(left);
    }
  }
}

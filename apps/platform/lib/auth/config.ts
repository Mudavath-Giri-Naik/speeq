import { randomBytes } from "node:crypto";
import { setting } from "../env";

const host = globalThis as typeof globalThis & { speeqDashboardDev?: { secret: string } };
/** Reads the platform's admin configuration on each request. */
export function authConfig() {
  const password = setting("ADMIN_PASSWORD"),
    secret = setting("SESSION_SECRET");
  if (process.env.NODE_ENV === "production") {
    if (!password || !secret || secret.length < 32) return null;
    return { password, secret, mode: "configured" as const };
  }
  if (password && secret) return { password, secret, mode: "configured" as const };
  if (!host.speeqDashboardDev) {
    host.speeqDashboardDev = { secret: randomBytes(32).toString("base64url") };
    console.warn("Platform admin development defaults are in use.");
  }
  return {
    password: password ?? "admin",
    secret: secret ?? host.speeqDashboardDev.secret,
    mode: "development-defaults" as const,
  };
}

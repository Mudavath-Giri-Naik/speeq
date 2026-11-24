import { createHash, timingSafeEqual } from "node:crypto";
import { SpeeqError } from "@speeq/server";
import { cookies } from "next/headers";

/** A fixed demo identity with a role assigned on the server. */
export interface DemoUser {
  id: string;
  name: string;
  role: "student" | "admin";
}

/** Accounts the login page can issue. */
export const DEMO_USERS: readonly DemoUser[] = [
  { id: "student-1", name: "Asha", role: "student" },
  { id: "student-2", name: "Ravi", role: "student" },
  { id: "admin", name: "Demo admin", role: "admin" },
];

/** Cookie carrying the signed demo identity. */
export const DEMO_COOKIE = "speeq_demo_session";

/** Session lifetime in seconds, shared by the payload and the cookie. */
export const DEMO_SESSION_SECONDS = 7 * 24 * 60 * 60;

const encode = new TextEncoder();

async function signingKey(secret: string) {
  const algorithm = { name: "HMAC", hash: "SHA-256" };
  const root = await crypto.subtle.importKey("raw", encode.encode(secret), algorithm, false, [
    "sign",
  ]);
  const derived = await crypto.subtle.sign("HMAC", root, encode.encode("speeq-demo-auth-v1"));
  return crypto.subtle.importKey("raw", derived, algorithm, false, ["sign", "verify"]);
}

function decodePart(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  const bytes = Buffer.from(value, "base64url");
  return bytes.toString("base64url") === value ? new Uint8Array(bytes) : undefined;
}

/** Signs the subject and expiry using the demo's domain-separated key. */
export async function signDemoSession(
  sub: string,
  secret: string,
  nowSeconds: number,
): Promise<string> {
  if (!secret.trim())
    throw new SpeeqError("NOT_CONFIGURED", { message: "Server is not configured" });
  const payload = Buffer.from(
    JSON.stringify({ sub, exp: nowSeconds + DEMO_SESSION_SECONDS }),
    "utf8",
  ).toString("base64url");
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encode.encode(payload),
  );
  return `${payload}.${Buffer.from(signature).toString("base64url")}`;
}

/** Verifies the signed claims and returns the server's fixed identity. */
export async function verifyDemoSession(
  value: string | undefined,
  secret: string,
  nowSeconds: number,
): Promise<DemoUser | null> {
  try {
    if (!value || !secret.trim()) return null;
    const [payload, signature, ...extra] = value.split(".");
    if (!payload || !signature || extra.length) return null;
    const data = decodePart(payload);
    const sig = decodePart(signature);
    if (
      !data ||
      !sig ||
      !(await crypto.subtle.verify("HMAC", await signingKey(secret), sig, encode.encode(payload)))
    )
      return null;
    const claims: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
    if (!claims || typeof claims !== "object") return null;
    const { sub, exp } = claims as { sub?: unknown; exp?: unknown };
    if (
      typeof sub !== "string" ||
      typeof exp !== "number" ||
      !Number.isFinite(exp) ||
      !(exp > nowSeconds)
    )
      return null;
    const user = DEMO_USERS.find((user) => user.id === sub);
    return user ? { ...user } : null;
  } catch {
    return null;
  }
}

/** Returns the configured signing secret or the development-only default. */
export function demoAuthSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return signingSecret(env);
}

function signingSecret(env: Record<string, string | undefined>): string | null {
  return (
    env.SPEEQ_SECRET?.trim() ||
    (env.NODE_ENV?.trim() === "production" ? null : "speeq-demo-dev-secret-not-for-production")
  );
}

/** Compares fixed-size password digests and disables unconfigured production admin login. */
export function checkAdminPassword(input: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected =
    env.DEMO_ADMIN_PASSWORD?.trim() || (env.NODE_ENV?.trim() === "production" ? "" : "admin");
  if (!expected) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(input), digest(expected));
}

function currentSession(value: string | undefined, env: Record<string, string | undefined>) {
  const secret = signingSecret(env);
  return secret
    ? verifyDemoSession(value, secret, Math.floor(Date.now() / 1000))
    : Promise.resolve(null);
}

/** Binds request authentication to the env supplied by the app or a test. */
export function createDemoUserReader(env: Record<string, string | undefined>) {
  return async function readUser(request: Request) {
    for (const entry of request.headers.get("cookie")?.split(";") ?? []) {
      const separator = entry.indexOf("=");
      if (separator >= 0 && entry.slice(0, separator).trim() === DEMO_COOKIE) {
        return currentSession(entry.slice(separator + 1).trim(), env);
      }
    }
    return null;
  };
}

/** Reads the demo identity from a web-standard request's Cookie header. */
export function readDemoUser(request: Request): Promise<DemoUser | null> {
  return createDemoUserReader(process.env)(request);
}

/** Reads the demo identity for a Next.js page or server action. */
export async function getCurrentUser(): Promise<DemoUser | null> {
  return currentSession((await cookies()).get(DEMO_COOKIE)?.value, process.env);
}

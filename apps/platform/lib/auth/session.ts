import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig } from "./config";
import { adminCookie } from "./cookie";

declare const verified: unique symbol;
/** Proof that an administrator session passed JWT verification. */
export type AdminSession = {
  readonly [verified]: true;
  readonly __brand: "AdminSession";
  readonly expiresAt: Date;
};
const issuer = "speeq-platform",
  audience = "dashboard";
/** Reports login availability without exposing configuration. */
export function authStatus() {
  const config = authConfig();
  return { enabled: !!config, mode: config?.mode ?? ("disabled" as const) };
}
/** Issues an eight-hour admin credential. */
export async function createAdminToken(now = new Date()) {
  const config = authConfig();
  if (!config) throw new Error("Admin login is not configured");
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject("admin")
    .setIssuedAt(iat)
    .setExpirationTime(iat + 28800)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(config.secret));
}
/** Verifies the cookie before exposing its expiry to callers. */
export async function readAdminSession(
  value: string | undefined,
  now = new Date(),
): Promise<AdminSession | null> {
  const config = authConfig();
  if (!config || !value) return null;
  try {
    const { payload } = await jwtVerify(value, new TextEncoder().encode(config.secret), {
      algorithms: ["HS256"],
      issuer,
      audience,
      clockTolerance: 5,
      currentDate: now,
      requiredClaims: ["exp", "iat", "jti"],
    });
    if (payload.sub !== "admin" || typeof payload.exp !== "number") return null;
    return { __brand: "AdminSession", expiresAt: new Date(payload.exp * 1000) } as AdminSession;
  } catch {
    return null;
  }
}
/** Authorizes the current request or redirects to the login page. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await readAdminSession((await cookies()).get(adminCookie().name)?.value);
  if (!session) redirect("/login");
  return session;
}

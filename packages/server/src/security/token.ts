import { SpeeqError } from "@speeq/core";

/** What a session token proves: this session belongs to this user until `exp`. */
export interface SessionClaims {
  /** Session id. */
  sid: string;
  /** User id, or `null` for anonymous sessions. */
  uid: string | null;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    keyCache.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/**
 * Signs claims into a compact token `base64url(json).base64url(hmac-sha256)`. Stateless: no
 * session lookup is needed to authenticate a request.
 */
export async function signSessionToken(claims: SessionClaims, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ v: 1, ...claims })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

/**
 * Verifies a token and returns its claims. Throws `UNAUTHENTICATED` for malformed or tampered
 * tokens and `SESSION_EXPIRED` for expired ones. The signature check (`crypto.subtle.verify`)
 * runs in constant time.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<SessionClaims> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new SpeeqError("UNAUTHENTICATED");
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromBase64Url(parts[1]),
      encoder.encode(parts[0]),
    );
  } catch {
    ok = false;
  }
  if (!ok) throw new SpeeqError("UNAUTHENTICATED");
  let claims: unknown;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
  } catch {
    throw new SpeeqError("UNAUTHENTICATED");
  }
  if (!isClaims(claims)) throw new SpeeqError("UNAUTHENTICATED");
  if (claims.exp * 1000 <= nowMs) throw new SpeeqError("SESSION_EXPIRED");
  return { sid: claims.sid, uid: claims.uid, exp: claims.exp };
}

function isClaims(value: unknown): value is SessionClaims {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sid === "string" &&
    (typeof v.uid === "string" || v.uid === null) &&
    typeof v.exp === "number"
  );
}

/** Compares two strings in constant time (for secrets such as passwords or keys). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

import { jsonRequest, startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { signSessionToken, timingSafeEqual, verifySessionToken } from "../src/index.js";
import { identityFingerprint } from "../src/security/token.js";
import { makeSpeeq, SECRET, userResolver } from "./helpers.js";

describe("session tokens", () => {
  const claims = { sid: "ses_1", uid: "u1", exp: Math.floor(Date.now() / 1000) + 60 };

  it("round-trips claims", async () => {
    const token = await signSessionToken(claims, SECRET);
    expect(await verifySessionToken(token, SECRET)).toEqual({ ...claims, tid: null });
    const withTenant = await signSessionToken({ ...claims, tid: "org_1" }, SECRET);
    expect(await verifySessionToken(withTenant, SECRET)).toEqual({ ...claims, tid: "org_1" });
  });

  it("still accepts v1 tokens from 0.11, reading the tenant as null", async () => {
    const payload = btoa(JSON.stringify({ v: 1, ...claims }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
    );
    const b64 = btoa(String.fromCharCode(...sig))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySessionToken(`${payload}.${b64}`, SECRET)).toEqual({ ...claims, tid: null });
  });

  it("rejects unknown token versions and malformed tenants", async () => {
    for (const body of [{ v: 3, ...claims }, { v: 2, ...claims, tid: 7 }, { ...claims }]) {
      const payload = btoa(JSON.stringify(body)).replace(/=+$/, "");
      await expect(verifySessionToken(`${payload}.x`, SECRET)).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    }
  });

  it("fingerprints identities without revealing them", async () => {
    const a = await identityFingerprint({ id: "u1" }, SECRET);
    expect(a).toHaveLength(22);
    expect(a).not.toContain("u1");
    expect(await identityFingerprint({ id: "u1" }, SECRET)).toBe(a);
    expect(await identityFingerprint({ id: "u2" }, SECRET)).not.toBe(a);
    expect(await identityFingerprint({ id: "u1", tenantId: "t1" }, SECRET)).not.toBe(a);
    expect(await identityFingerprint({ id: "u1" }, `${SECRET}x`)).not.toBe(a);
    expect(await identityFingerprint(null, SECRET)).toBe("anonymous");
  });

  it("rejects expired tokens with SESSION_EXPIRED", async () => {
    const token = await signSessionToken({ ...claims, exp: 1 }, SECRET);
    await expect(verifySessionToken(token, SECRET)).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });

  it("rejects tampered payloads, wrong secrets and garbage", async () => {
    const token = await signSessionToken(claims, SECRET);
    const [payload, sig] = token.split(".");
    const forged = btoa(JSON.stringify({ v: 1, ...claims, uid: "admin" })).replace(/=+$/, "");
    await expect(verifySessionToken(`${forged}.${sig}`, SECRET)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(verifySessionToken(token, `${SECRET}x`)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(verifySessionToken(`${payload}`, SECRET)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(verifySessionToken("a.b", SECRET)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("compares secrets in constant time", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

const quiet = { error: () => {}, warn: () => {} };

describe("session authentication", () => {
  it("requires a token for turns", async () => {
    const { speeq } = makeSpeeq([]);
    const res = await speeq.handler(
      jsonRequest("/api/speeq/session/ses_x/turn", { body: { text: "hi", language: "en-IN" } }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses a token used for another session id", async () => {
    const { speeq } = makeSpeeq([]);
    const a = await startSession(speeq.handler);
    const b = await startSession(speeq.handler);
    const res = await speeq.handler(
      jsonRequest(`/api/speeq/session/${b.sessionId}/turn`, {
        body: { text: "hi", language: "en-IN" },
        token: a.token,
      }),
    );
    expect(res.status).toBe(403);
  });

  const turnAs = (
    speeq: ReturnType<typeof makeSpeeq>["speeq"],
    s: { sessionId: string; token: string },
    headers: Record<string, string>,
  ) =>
    speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/turn`, {
        body: { text: "hi", language: "en-IN" },
        token: s.token,
        headers,
      }),
    );
  const errorOf = async (res: Response) =>
    ((await res.json()) as { error: { code: string } }).error;

  it("ends the session with IDENTITY_CHANGED when a different user is signed in", async () => {
    const { speeq } = makeSpeeq([{ text: "hi" }], { resolveUser: userResolver });
    const s = await startSession(speeq.handler, { headers: { "x-test-user": "alice" } });
    const res = await turnAs(speeq, s, { "x-test-user": "mallory" });
    expect(res.status).toBe(401);
    expect(await errorOf(res)).toMatchObject({ code: "IDENTITY_CHANGED" });
  });

  it("ends the session after logout and after login", async () => {
    const { speeq } = makeSpeeq([{ text: "hi" }, { text: "hi" }], {
      resolveUser: userResolver,
      allowAnonymous: true,
    });
    const signedIn = await startSession(speeq.handler, { headers: { "x-test-user": "alice" } });
    expect(await errorOf(await turnAs(speeq, signedIn, {}))).toMatchObject({
      code: "IDENTITY_CHANGED",
    });
    const anon = await startSession(speeq.handler);
    expect(await errorOf(await turnAs(speeq, anon, { "x-test-user": "alice" }))).toMatchObject({
      code: "IDENTITY_CHANGED",
    });
  });

  it("ends the session when the tenant changes", async () => {
    const resolveUser = (r: Request) => {
      const id = r.headers.get("x-test-user");
      const org = r.headers.get("x-test-org");
      return id ? { id, roles: ["student"], ...(org ? { tenantId: org } : {}) } : null;
    };
    const { speeq } = makeSpeeq([{ text: "hi" }], { resolveUser });
    const s = await startSession(speeq.handler, {
      headers: { "x-test-user": "alice", "x-test-org": "acme" },
    });
    const res = await turnAs(speeq, s, { "x-test-user": "alice", "x-test-org": "globex" });
    expect(await errorOf(res)).toMatchObject({ code: "IDENTITY_CHANGED" });
    const none = await turnAs(speeq, s, { "x-test-user": "alice" });
    expect(await errorOf(none)).toMatchObject({ code: "IDENTITY_CHANGED" });
  });

  it("answers AUTH_UNAVAILABLE, not a logout, when resolveUser throws on a signed-in session", async () => {
    let down = false;
    const resolveUser = (r: Request) => {
      if (down) throw new Error("auth backend down");
      return userResolver(r);
    };
    const { speeq } = makeSpeeq([{ text: "hi" }], { resolveUser, logger: quiet });
    const s = await startSession(speeq.handler, { headers: { "x-test-user": "alice" } });
    down = true;
    const res = await turnAs(speeq, s, { "x-test-user": "alice" });
    expect(res.status).toBe(503);
    expect(await errorOf(res)).toMatchObject({ code: "AUTH_UNAVAILABLE" });
    down = false;
    expect((await turnAs(speeq, s, { "x-test-user": "alice" })).status).toBe(200);
  });

  it("treats a malformed user from resolveUser as a failure", async () => {
    const resolveUser = () => ({ id: 42, roles: [] }) as unknown as { id: string; roles: string[] };
    const { speeq } = makeSpeeq([], { resolveUser, logger: quiet });
    const res = await speeq.handler(jsonRequest("/api/speeq/session", { body: {} }));
    expect(await errorOf(res)).toMatchObject({ code: "AUTH_UNAVAILABLE" });
  });

  it("fails session creation with AUTH_UNAVAILABLE only when anonymous is not allowed", async () => {
    const resolveUser = () => {
      throw new Error("down");
    };
    const strict = makeSpeeq([], { resolveUser, logger: quiet }).speeq;
    const res = await strict.handler(jsonRequest("/api/speeq/session", { body: {} }));
    expect(res.status).toBe(503);
    const open = makeSpeeq([], { resolveUser, allowAnonymous: true, logger: quiet }).speeq;
    expect((await open.handler(jsonRequest("/api/speeq/session", { body: {} }))).status).toBe(200);
  });

  it("requires sign-in when resolveUser is set and anonymous is not allowed", async () => {
    const { speeq } = makeSpeeq([], { resolveUser: userResolver });
    const res = await speeq.handler(jsonRequest("/api/speeq/session", { body: {} }));
    expect(res.status).toBe(401);
  });
});

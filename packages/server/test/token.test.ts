import { jsonRequest, startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { signSessionToken, timingSafeEqual, verifySessionToken } from "../src/index.js";
import { makeSpeeq, SECRET, userResolver } from "./helpers.js";

describe("session tokens", () => {
  const claims = { sid: "ses_1", uid: "u1", exp: Math.floor(Date.now() / 1000) + 60 };

  it("round-trips claims", async () => {
    const token = await signSessionToken(claims, SECRET);
    expect(await verifySessionToken(token, SECRET)).toEqual(claims);
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

  it("refuses a token when a different user is signed in", async () => {
    const { speeq } = makeSpeeq([{ text: "hi" }], { resolveUser: userResolver });
    const s = await startSession(speeq.handler, { headers: { "x-test-user": "alice" } });
    const res = await speeq.handler(
      jsonRequest(`/api/speeq/session/${s.sessionId}/turn`, {
        body: { text: "hi", language: "en-IN" },
        token: s.token,
        headers: { "x-test-user": "mallory" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("requires sign-in when resolveUser is set and anonymous is not allowed", async () => {
    const { speeq } = makeSpeeq([], { resolveUser: userResolver });
    const res = await speeq.handler(jsonRequest("/api/speeq/session", { body: {} }));
    expect(res.status).toBe(401);
  });
});

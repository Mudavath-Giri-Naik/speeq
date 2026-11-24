import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  isErrorCode,
  isSpeeqError,
  SpeeqError,
  toPublicError,
  toSpeeqError,
} from "../src/errors.js";

describe("SpeeqError", () => {
  it("has a status and defaults for every code", () => {
    for (const code of ERROR_CODES) {
      const e = new SpeeqError(code);
      expect(e.status).toBe(ERROR_HTTP_STATUS[code]);
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it("marks rate limits retryable with a hint", () => {
    const e = new SpeeqError("RATE_LIMITED", { retryAfterMs: 2000 });
    expect(e.retryable).toBe(true);
    expect(toPublicError(e)).toEqual({
      code: "RATE_LIMITED",
      message: e.message,
      retryable: true,
      retryAfterMs: 2000,
    });
  });

  it("never leaks unknown error messages", () => {
    const pub = toPublicError(new Error("db password is hunter2 at /srv/app.js:10"));
    expect(pub.code).toBe("INTERNAL");
    expect(pub.message).not.toContain("hunter2");
    expect(JSON.stringify(pub)).not.toContain("app.js");
  });

  it("recognizes errors across copies by brand", () => {
    const fake = { isSpeeqError: true, code: "FORBIDDEN", message: "x" };
    expect(isSpeeqError(fake)).toBe(true);
    expect(isSpeeqError(new Error("x"))).toBe(false);
    expect(toSpeeqError(new SpeeqError("FORBIDDEN")).code).toBe("FORBIDDEN");
    expect(toSpeeqError("boom", "TOOL_ERROR").code).toBe("TOOL_ERROR");
  });

  it("validates codes", () => {
    expect(isErrorCode("RATE_LIMITED")).toBe(true);
    expect(isErrorCode("NOPE")).toBe(false);
  });

  it("keeps the cause for logs", () => {
    const cause = new Error("inner");
    expect(new SpeeqError("PROVIDER_ERROR", { cause }).cause).toBe(cause);
  });
});

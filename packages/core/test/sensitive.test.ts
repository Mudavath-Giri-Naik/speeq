import { describe, expect, it } from "vitest";
import { isRestrictedName, isSensitiveName, looksSecret, redactPath } from "../src/utils/index.js";

describe("sensitive names and values", () => {
  it("matches whole words only", () => {
    for (const n of ["password", "userPassword", "api_key", "cardNumber", "otp", "pinCode", "ssn"])
      expect(isSensitiveName(n), n).toBe(true);
    for (const n of ["panel", "pinterestUrl", "title", "keyboard", "tokenizer"])
      expect(isSensitiveName(n), n).toBe(false);
  });
  it("restricts more for customer context", () => {
    for (const n of ["sessionCookie", "credentials", "dateOfBirth", "passportNumber", "privateKey"])
      expect(isRestrictedName(n), n).toBe(true);
    for (const n of ["courseTitle", "progress", "practiceSession", "qty"])
      expect(isRestrictedName(n), n).toBe(false);
  });
  it("recognises secret-shaped values", () => {
    expect(looksSecret("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghij")).toBe(true);
    expect(looksSecret("sk-proj-abcdefghijklmnop1234")).toBe(true);
    expect(looksSecret("0123456789abcdef0123456789abcdef")).toBe(true);
    expect(looksSecret("4242 4242 4242 4242")).toBe(true);
    expect(looksSecret("Operating Systems by Galvin")).toBe(false);
    expect(looksSecret("2026-11-28")).toBe(false);
  });
  it("leaves paths without a query alone", () => {
    expect(redactPath("/courses/os")).toBe("/courses/os");
  });
});

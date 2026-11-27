import { looksSecret, redactPath } from "@speeq/core/utils";
import { expect, it, vi } from "vitest";
import { pageContext } from "../src/context.js";

it("never sends secret query parameters from the browser", () => {
  vi.stubGlobal("location", { pathname: "/auth/callback", search: "?code=abc&state=xyz&tab=2" });
  const ctx = pageContext(() => ({ data: { selected: { id: "q1" } } }));
  expect(ctx?.path).toBe("/auth/callback?code=[REDACTED]&state=[REDACTED]&tab=2");
  vi.unstubAllGlobals();
});

it("redacts by name and by value shape, and keeps ordinary parameters", () => {
  expect(redactPath("/p?subject=os&difficulty=hard")).toBe("/p?subject=os&difficulty=hard");
  expect(redactPath("/p?x=4111111111111111")).toBe("/p?x=[REDACTED]");
  expect(redactPath("/p?apiKey=1&q=a#top")).toBe("/p?apiKey=[REDACTED]&q=a#top");
  expect(looksSecret("hello world")).toBe(false);
  expect(looksSecret("4111 1111 1111 1112")).toBe(false); // fails Luhn
});

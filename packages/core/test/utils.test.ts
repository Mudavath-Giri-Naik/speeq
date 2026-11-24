import { describe, expect, it, vi } from "vitest";
import {
  combineSignals,
  createId,
  REDACTED,
  redactKeys,
  redactText,
  safeJsonParse,
  safeJsonStringify,
  sleep,
  TypedEmitter,
  truncate,
} from "../src/utils/index.js";

describe("utils", () => {
  it("creates unique prefixed ids", () => {
    const a = createId("ses");
    expect(a).toMatch(/^ses_[0-9a-f]{32}$/);
    expect(createId("ses")).not.toBe(a);
  });

  it("parses and stringifies safely", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(safeJsonParse("{").ok).toBe(false);
    const cyclic: Record<string, unknown> = { n: 1n };
    cyclic.self = cyclic;
    expect(safeJsonStringify(cyclic)).toBe('{"n":"1","self":"[Circular]"}');
    expect(safeJsonStringify(undefined)).toBe("null");
    expect(safeJsonStringify(new Error("x"))).toContain('"message":"x"');
  });

  it("truncates with a marker", () => {
    expect(truncate("abc", 5)).toEqual({ text: "abc", truncated: false });
    const t = truncate("a".repeat(100), 20);
    expect(t.truncated).toBe(true);
    expect(t.text.length).toBeLessThanOrEqual(20);
  });

  it("redacts secret keys deeply and text patterns", () => {
    const out = redactKeys({
      user: { name: "x", Password: "p", "api-key": "k" },
      list: [{ token: 1 }],
    });
    expect(out).toEqual({
      user: { name: "x", Password: REDACTED, "api-key": REDACTED },
      list: [{ token: REDACTED }],
    });
    expect(redactText("mail a.b@c.com or +91 98765 43210")).toBe(`mail ${REDACTED} or ${REDACTED}`);
  });

  it("emits typed events and isolates throwing listeners", () => {
    const em = new TypedEmitter<{ n: number }>();
    const seen: number[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    em.on("n", () => {
      throw new Error("bad");
    });
    const off = em.on("n", (v) => seen.push(v));
    em.once("n", (v) => seen.push(v * 10));
    em.emit("n", 1);
    em.emit("n", 2);
    off();
    em.emit("n", 3);
    expect(seen).toEqual([1, 10, 2]);
    spy.mockRestore();
  });

  it("combines signals and times out", async () => {
    const a = new AbortController();
    const s = combineSignals([a.signal, undefined]);
    a.abort("x");
    expect(s.aborted).toBe(true);
    const t = combineSignals([], 10);
    await expect(sleep(1000, t)).rejects.toBeDefined();
  });
});

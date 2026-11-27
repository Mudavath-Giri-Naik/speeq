import { describe, expect, it, vi } from "vitest";
import { createFormFillHandler, formFillActionName } from "../src/index.js";

const signal = new AbortController().signal;
function setup(dirty: string[] = []) {
  const setValues = vi.fn();
  const handler = createFormFillHandler({ setValues, isDirty: (n) => dirty.includes(n) });
  return { setValues, run: (args: unknown) => handler(args, signal) };
}

describe("createFormFillHandler", () => {
  it("writes clean fields and reports them", async () => {
    const { setValues, run } = setup();
    expect(await run({ values: { subject: "physics", count: 3, on: true } })).toEqual({
      applied: ["subject", "count", "on"],
      rejected: [],
    });
    expect(setValues).toHaveBeenCalledWith({ subject: "physics", count: 3, on: true });
  });

  it("never writes a field the user edited", async () => {
    const { setValues, run } = setup(["q"]);
    const result = await run({ values: { q: "mine", subject: "physics" } });
    expect(result).toEqual({
      applied: ["subject"],
      rejected: [{ field: "q", reason: "FIELD_DIRTY" }],
    });
    expect(setValues).toHaveBeenCalledWith({ subject: "physics" });
  });

  it("writes nothing and still answers when every field is dirty", async () => {
    const { setValues, run } = setup(["a", "b"]);
    const result = (await run({ values: { a: "1", b: "2" } })) as { applied: string[] };
    expect(result.applied).toEqual([]);
    expect(setValues).not.toHaveBeenCalled();
  });

  it("rejects values that are not plain strings, finite numbers or booleans", async () => {
    const { setValues, run } = setup();
    const result = await run({
      values: { a: { x: 1 }, b: null, c: Number.NaN, d: [1], e: () => 1, ok: "yes" },
    });
    expect(result).toMatchObject({ applied: ["ok"] });
    expect((result as { rejected: unknown[] }).rejected).toHaveLength(5);
    expect(setValues).toHaveBeenCalledWith({ ok: "yes" });
  });

  it("ignores prototype keys", async () => {
    const { setValues, run } = setup();
    const values = JSON.parse('{"__proto__":"x","constructor":"y","prototype":"z","fine":"1"}');
    const result = (await run({ values })) as { applied: string[] };
    expect(result.applied).toEqual(["fine"]);
    expect(setValues).toHaveBeenCalledWith({ fine: "1" });
  });

  it("treats a throwing isDirty as dirty", async () => {
    const setValues = vi.fn();
    const handler = createFormFillHandler({
      setValues,
      isDirty: () => {
        throw new Error("no form");
      },
    });
    expect(await handler({ values: { a: "1" } }, signal)).toMatchObject({ applied: [] });
    expect(setValues).not.toHaveBeenCalled();
  });

  it("copes with missing or malformed arguments and caps the number of fields", async () => {
    const { setValues, run } = setup();
    for (const bad of [undefined, null, "x", {}, { values: "x" }, { values: [1, 2] }])
      expect(await run(bad)).toEqual({ applied: [], rejected: [] });
    const values = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`f${i}`, "x"]));
    const result = (await run({ values })) as { applied: string[] };
    expect(result.applied).toHaveLength(30);
    expect(setValues).toHaveBeenCalledOnce();
  });
});

it("exposes the shared action name", () => {
  expect(formFillActionName("form:a#form1")).toMatch(/^ui_fill_/);
});

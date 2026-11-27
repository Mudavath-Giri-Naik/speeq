import { formFillActionName } from "@speeq/core";
import { startSession } from "@speeq/testing";
import { describe, expect, it } from "vitest";
import { defineFormFill, type FormFieldSpec } from "../src/index.js";
import { makeSpeeq } from "./helpers.js";

const f = (name: string, type = "text", extra: Partial<FormFieldSpec> = {}): FormFieldSpec => ({
  name,
  type,
  required: false,
  sensitive: false,
  ...extra,
});
const fields = [
  f("subject", "select"),
  f("q", "search"),
  f("count", "number"),
  f("newsletter", "checkbox"),
  f("password", "password", { sensitive: true }),
  f("token", "text", { sensitive: true }),
  f("avatar", "file"),
  f("csrf", "hidden"),
  f("card_number", "text"),
];
const form = defineFormFill({ id: "form:app/contact/page.tsx#form1", title: "Contact", fields });
const parse = (values: Record<string, unknown>) => form.input.safeParse({ values });
const message = (values: Record<string, unknown>) => {
  const r = parse(values);
  return r.success ? "" : r.error.issues.map((i) => i.message).join("; ");
};

describe("defineFormFill", () => {
  it("is a read-only, non-confirming UI action with the shared name", () => {
    expect(form.name).toBe(formFillActionName("form:app/contact/page.tsx#form1"));
    expect(form).toMatchObject({ risk: "read", confirm: false });
  });

  it("accepts partial fills of the right types", () => {
    expect(parse({ subject: "physics" }).success).toBe(true);
    expect(parse({ q: "motion", count: 3, newsletter: true }).success).toBe(true);
    expect(parse({}).success).toBe(true);
  });

  it("rejects protected, unfillable and unknown fields by name", () => {
    for (const key of ["password", "token", "avatar", "csrf", "card_number", "nope"]) {
      expect(message({ [key]: "x" })).toContain(`FIELD_NOT_ALLOWED: "${key}"`);
    }
    expect(message({ password: "x" })).toContain("protected");
    expect(message({ avatar: "x" })).toContain("cannot be filled");
    expect(message({ nope: "x" })).toContain("not a field");
  });

  it("rejects prototype keys", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const result = parse(JSON.parse(`{"${key}":"x"}`));
      // Zod itself drops `__proto__`; whatever passes must not carry the key forward.
      if (result.success)
        expect(Object.hasOwn((result.data as { values: object }).values, key)).toBe(false);
    }
  });

  it("rejects wrong types and oversize values", () => {
    expect(parse({ count: "3" }).success).toBe(false);
    expect(parse({ count: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(parse({ newsletter: "yes" }).success).toBe(false);
    expect(parse({ q: 5 }).success).toBe(false);
    expect(parse({ q: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects more than 30 values", () => {
    const many = defineFormFill({
      id: "form:big",
      title: "Big",
      fields: Array.from({ length: 40 }, (_, i) => f(`f${i}`)),
    });
    const values = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`f${i}`, "x"]));
    expect(many.input.safeParse({ values }).success).toBe(false);
  });

  it("keeps protected fields out of what the model sees", () => {
    const text = JSON.stringify({ d: form.description });
    for (const hidden of ["password", "token", "avatar", "csrf", "card_number"])
      expect(text).not.toContain(hidden);
    expect(form.description).toContain("subject (select)");
  });

  it("collapses radios that share a name and refuses a form with nothing fillable", () => {
    const radios = defineFormFill({
      id: "form:r",
      title: "R",
      fields: [f("size", "radio"), f("size", "radio"), f("size", "radio")],
    });
    expect(radios.description.match(/size \(radio/g)).toHaveLength(1);
    expect(() =>
      defineFormFill({ id: "form:x", title: "X", fields: [f("password", "password")] }),
    ).toThrow(/no field that can be filled/);
  });

  it("never echoes values in the summary", () => {
    const text = form.summary({ values: { q: "my secret question" } }, {} as never);
    expect(text).toContain("q");
    expect(text).not.toContain("my secret question");
  });
});

describe("form fill through the agent loop", () => {
  const optIn = { capabilities: ["ui-actions"] };
  it("rejects a protected field before anything reaches the page", async () => {
    const { speeq, llm } = makeSpeeq(
      [
        { toolCalls: [{ name: form.name, arguments: { values: { password: "hunter2" } } }] },
        { text: "I cannot fill that." },
      ],
      { uiActions: [form] },
    );
    const s = await startSession(speeq.handler, optIn);
    const events = await s.turn("fill my password");
    expect(events.some((e) => e.type === "ui.action")).toBe(false);
    expect(JSON.stringify(llm.requests[1]?.messages)).toContain("FIELD_NOT_ALLOWED");
  });

  it("emits a valid fill to the page", async () => {
    const { speeq } = makeSpeeq(
      [{ toolCalls: [{ name: form.name, arguments: { values: { subject: "physics" } } }] }],
      { uiActions: [form] },
    );
    const events = await (await startSession(speeq.handler, optIn)).turn("fill physics");
    expect(events.find((e) => e.type === "ui.action")).toMatchObject({
      name: form.name,
      args: { values: { subject: "physics" } },
      confirm: false,
    });
  });
});

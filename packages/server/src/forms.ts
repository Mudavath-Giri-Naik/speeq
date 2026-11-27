import { DEFAULT_SECRET_KEYS, formFillActionName, SpeeqError } from "@speeq/core";
import { z } from "zod";
import { defineUiAction, type UiActionDefinition } from "./define.js";

/** One field of a discovered form, as recorded in the manifest. */
export interface FormFieldSpec {
  name: string;
  /** The input `type`, or the tag name (`select`, `textarea`) when there is none. */
  type: string;
  required: boolean;
  /** True when the compiler recognised the name as a secret, card, OTP or password field. */
  sensitive: boolean;
}

/** A form fill action plus the field list it was built from (used by `speeq verify`). */
export type FormFillAction = UiActionDefinition & {
  form: { id: string; fields: FormFieldSpec[] };
};

const UNFILLABLE = new Set(["password", "hidden", "file", "submit", "button", "image", "reset"]);
const NUMBER = new Set(["number", "range"]);
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const validName = (n: string) =>
  n.length >= 1 && n.length <= 100 && !/\s/u.test(n) && ![...n].some((c) => c.charCodeAt(0) < 32);
const MAX_FIELDS = 30;
const MAX_TEXT = 2000;
const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, "");
const SECRET = DEFAULT_SECRET_KEYS.map(norm);

function looksSecret(name: string): boolean {
  const n = norm(name);
  return SECRET.some((k) => n.includes(k)) || /otp|pin\b|cvc|iban/i.test(name);
}

/** Why a field can never be filled, or `undefined` when it can. */
export function protectedReason(f: FormFieldSpec): string | undefined {
  if (PROTOTYPE_KEYS.has(f.name) || !validName(f.name)) return "has an unsupported name";
  if (f.sensitive || looksSecret(f.name)) return "is a protected field";
  if (UNFILLABLE.has(f.type.toLowerCase())) return `has type "${f.type}", which cannot be filled`;
  return undefined;
}

function valueSchema(type: string): z.ZodType {
  const t = type.toLowerCase();
  if (NUMBER.has(t)) return z.number().finite();
  if (t === "checkbox") return z.boolean();
  return z.string().max(MAX_TEXT);
}

/**
 * Builds the UI action that fills a **draft** of a form on the page. It never submits.
 *
 * This is the server-side field filter: only fields that are known, not protected and of a fillable
 * type can reach the page. Anything else is rejected with a message starting `FIELD_NOT_ALLOWED` that
 * names the field, so the model learns what was refused and nothing is written. Protected fields are
 * left out of the schema the model sees.
 */
export function defineFormFill(spec: {
  id: string;
  title: string;
  fields: readonly FormFieldSpec[];
}): FormFillAction {
  const allowed = new Map<string, FormFieldSpec>();
  const refused = new Map<string, string>();
  for (const f of spec.fields) {
    const why = protectedReason(f);
    if (why) refused.set(f.name, why);
    else if (!allowed.has(f.name)) allowed.set(f.name, f);
  }
  if (allowed.size === 0) {
    throw new SpeeqError("NOT_CONFIGURED", {
      message: `speeq: form "${spec.id}" has no field that can be filled.`,
    });
  }
  const shape: Record<string, z.ZodType> = {};
  for (const f of allowed.values()) shape[f.name] = valueSchema(f.type).optional();
  const values = z.looseObject(shape).superRefine((v, ctx) => {
    const keys = Object.keys(v);
    if (keys.length > MAX_FIELDS)
      ctx.addIssue({ code: "custom", message: `FIELD_NOT_ALLOWED: at most ${MAX_FIELDS} fields` });
    for (const key of keys) {
      if (allowed.has(key)) continue;
      const why = refused.get(key) ?? "is not a field of this form";
      ctx.addIssue({ code: "custom", path: [key], message: `FIELD_NOT_ALLOWED: "${key}" ${why}` });
    }
  });
  const list = [...allowed.values()]
    .map((f) => `${f.name} (${f.type}${f.required ? ", required" : ""})`)
    .join(", ");
  const action = defineUiAction({
    name: formFillActionName(spec.id),
    description: `Fill a draft of the "${spec.title.slice(0, 80)}" form on this page. The user reviews and submits it; nothing is sent. Only include fields the user asked for. Fields: ${list}.`,
    input: z.object({ values }),
    risk: "read",
    confirm: false,
    summary: (input: { values: Record<string, unknown> }) =>
      `Fill the form: ${Object.keys(input.values).slice(0, 10).join(", ") || "no fields"}`,
  });
  return Object.assign(action, {
    form: { id: spec.id, fields: [...spec.fields] },
  }) as FormFillAction;
}

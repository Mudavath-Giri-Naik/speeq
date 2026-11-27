import type { JsonSchemaLite } from "@speeq/core/manifest";

/** Result of rendering a manifest schema to Zod source. */
export type ZodSource = { ok: true; code: string } | { ok: false; reason: string };

const SECRET_WORDS = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "apikey",
  "cvv",
  "cvc",
  "otp",
  "pin",
  "ssn",
  "card",
  "passcode",
]);
const MAX_DEPTH = 8;

/** True for a field name that looks like a credential or card datum. */
export function isSecretName(name: string): boolean {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.some((w) => SECRET_WORDS.has(w))) return true;
  const joined = words.join("");
  return joined.includes("apikey") || joined.includes("accesskey") || joined.includes("creditcard");
}
class Unrenderable extends Error {}
const q = (s: string) => JSON.stringify(s);
const text = (s: string) => q(s.replace(/\p{Cc}/gu, " ").slice(0, 200));

function num(s: JsonSchemaLite, integer: boolean): string {
  let out = integer ? "z.int()" : "z.number()";
  if (s.minimum !== undefined) out += `.min(${s.minimum})`;
  if (s.maximum !== undefined) out += `.max(${s.maximum})`;
  if (s.exclusiveMinimum !== undefined) out += `.gt(${s.exclusiveMinimum})`;
  if (s.exclusiveMaximum !== undefined) out += `.lt(${s.exclusiveMaximum})`;
  return out;
}
function str(s: JsonSchemaLite): string {
  let out =
    s.format === "email"
      ? "z.email()"
      : s.format === "uri"
        ? "z.url()"
        : s.format === "uuid"
          ? "z.uuid()"
          : "z.string()";
  if (s.minLength !== undefined) out += `.min(${s.minLength})`;
  if (s.maxLength !== undefined) out += `.max(${s.maxLength})`;
  if (s.pattern !== undefined) {
    try {
      new RegExp(s.pattern);
    } catch {
      throw new Unrenderable("a pattern is not a valid regular expression");
    }
    if (s.pattern.length > 200) throw new Unrenderable("a pattern is too long");
    out += `.regex(new RegExp(${q(s.pattern)}))`;
  }
  return out;
}
function literal(v: unknown): string {
  if (v === null || ["string", "number", "boolean"].includes(typeof v))
    return `z.literal(${JSON.stringify(v)})`;
  throw new Unrenderable("an enum has a non-primitive value");
}
function node(s: JsonSchemaLite, depth: number): string {
  if (depth > MAX_DEPTH) throw new Unrenderable("the schema is nested too deeply");
  let out: string;
  if (s.enum) {
    if (s.enum.length === 0) throw new Unrenderable("an enum is empty");
    out =
      s.enum.every((v) => typeof v === "string") && s.enum.length > 0
        ? `z.enum([${s.enum.map((v) => q(String(v))).join(", ")}])`
        : s.enum.length === 1
          ? literal(s.enum[0])
          : `z.union([${s.enum.map(literal).join(", ")}])`;
  } else if (s.anyOf) {
    if (s.anyOf.length === 0) throw new Unrenderable("anyOf is empty");
    const parts = s.anyOf.map((p) => node(p, depth + 1));
    out = parts.length === 1 ? (parts[0] as string) : `z.union([${parts.join(", ")}])`;
  } else {
    switch (s.type) {
      case "string":
        out = str(s);
        break;
      case "number":
        out = num(s, false);
        break;
      case "integer":
        out = num(s, true);
        break;
      case "boolean":
        out = "z.boolean()";
        break;
      case "null":
        out = "z.null()";
        break;
      case "array": {
        if (!s.items) throw new Unrenderable("an array has no item schema");
        out = `z.array(${node(s.items, depth + 1)})`;
        if (s.minItems !== undefined) out += `.min(${s.minItems})`;
        if (s.maxItems !== undefined) out += `.max(${s.maxItems})`;
        break;
      }
      case "object": {
        const required = new Set(s.required ?? []);
        const fields = Object.entries(s.properties ?? {}).map(([key, value]) => {
          if (isSecretName(key)) throw new Unrenderable(`the field "${key}" looks like a secret`);
          let code = node(value, depth + 1);
          if (value.default !== undefined) code += `.default(${JSON.stringify(value.default)})`;
          else if (!required.has(key)) code += ".optional()";
          return `${q(key)}: ${code}`;
        });
        out = `${s.additionalProperties === false ? "z.strictObject" : "z.object"}({ ${fields.join(", ")} })`;
        break;
      }
      default:
        throw new Unrenderable("a schema has no recognised type");
    }
  }
  if (s.description) out += `.describe(${text(s.description)})`;
  return out;
}
/** Render a manifest JSON schema as Zod source. Never guesses: unsupported shapes fail. */
export function renderZod(schema: JsonSchemaLite): ZodSource {
  try {
    return { ok: true, code: node(schema, 0) };
  } catch (e) {
    if (e instanceof Unrenderable)
      return { ok: false, reason: `Input schema not renderable: ${e.message}.` };
    throw e;
  }
}
/** Render an object schema from named properties, used to merge path, query and body inputs. */
export function renderObject(
  fields: { name: string; schema?: JsonSchemaLite; required: boolean }[],
): ZodSource {
  const props: Record<string, JsonSchemaLite> = {};
  const required: string[] = [];
  for (const f of fields) {
    props[f.name] = f.schema ?? { type: "string" };
    if (f.required) required.push(f.name);
  }
  return renderZod({ type: "object", properties: props, required });
}

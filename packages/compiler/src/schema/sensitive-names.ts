import type { JsonSchemaLite } from "@speeq/core/manifest";
import { words } from "../nextjs/sensitivity.js";

const single = new Set(
  "password passwd pwd secret token cvv cvc otp pin ssn aadhaar iban".split(" "),
);
const joined = new Set("apikey cardnumber ccnumber accountnumber pannumber".split(" "));
/**
 * Does a field name look like a secret, card or identity number? Whole words only, so `pinCode`
 * matches but `pinterestUrl` and `panel` do not.
 */
export function isSensitiveName(name: string) {
  const ws = words(name);
  if (ws.some((w) => single.has(w))) return true;
  if (joined.has(ws.join(""))) return true;
  for (let i = 0; i + 1 < ws.length; i++) if (joined.has(`${ws[i]}${ws[i + 1]}`)) return true;
  return false;
}
/** Does any property name anywhere in the schema look sensitive? */
export function schemaHasSensitive(schema: JsonSchemaLite): boolean {
  for (const [k, v] of Object.entries(schema.properties ?? {}))
    if (isSensitiveName(k) || schemaHasSensitive(v)) return true;
  if (schema.items && schemaHasSensitive(schema.items)) return true;
  return (schema.anyOf ?? []).some(schemaHasSensitive);
}

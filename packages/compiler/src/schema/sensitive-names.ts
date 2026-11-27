import type { JsonSchemaLite } from "@speeq/core/manifest";
import { isSensitiveName } from "@speeq/core/utils";

/** Shared with the runtime so the two lists cannot drift (ADR-0023). */
export { isSensitiveName };
/** Does any property name anywhere in the schema look sensitive? */
export function schemaHasSensitive(schema: JsonSchemaLite): boolean {
  for (const [k, v] of Object.entries(schema.properties ?? {}))
    if (isSensitiveName(k) || schemaHasSensitive(v)) return true;
  if (schema.items && schemaHasSensitive(schema.items)) return true;
  return (schema.anyOf ?? []).some(schemaHasSensitive);
}

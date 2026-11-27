import { createHash } from "node:crypto";
import { type CapabilityKind, idSchema } from "@speeq/core/manifest";
import { ToolError } from "./tool-error.js";

function validateId(id: string) {
  if (!idSchema.safeParse(id).success) throw new ToolError("SQ0010", { field: "id" });
  return id;
}
/** Build a stable framework identity. */
export function capabilityId(kind: CapabilityKind, key: string) {
  return validateId(`${kind}:${key}`);
}
/** Split an identity at its first colon. */
export function parseCapabilityId(id: string) {
  validateId(id);
  const pos = id.indexOf(":");
  return { kind: id.slice(0, pos) as CapabilityKind, key: id.slice(pos + 1) };
}
/** Default runtime tool name for an identity. */
export function toolName(id: string) {
  validateId(id);
  return id.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64);
}
/** Allocate unique names in deterministic order, reserving all unsuffixed names first. */
export function assignToolNames(ids: readonly string[]) {
  const groups = new Map<string, string[]>();
  for (const id of [...new Set(ids)].sort()) {
    const name = toolName(id);
    const group = groups.get(name) ?? [];
    group.push(id);
    groups.set(name, group);
  }
  const used = new Set(groups.keys()),
    result = new Map<string, string>();
  for (const [base, group] of groups) {
    for (const id of group) {
      let name = base;
      if (group.length > 1) {
        let salt = 0;
        do {
          const suffix = createHash("sha256")
            .update(JSON.stringify([id, salt++]))
            .digest("hex")
            .slice(0, 10);
          name = `${base.slice(0, 53)}_${suffix}`;
        } while (used.has(name));
        used.add(name);
      }
      result.set(id, name);
    }
  }
  return result;
}

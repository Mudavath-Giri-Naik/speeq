import { createHash } from "node:crypto";
/** Serialize JSON data with lexically sorted object keys. */
export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  function encode(v: unknown): string {
    if (
      v === null ||
      typeof v === "string" ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v))
    )
      return JSON.stringify(v);
    if (typeof v !== "object" || active.has(v)) throw new TypeError("Expected acyclic JSON data");
    active.add(v);
    try {
      if (Array.isArray(v)) return `[${Array.from(v, encode).join(",")}]`;
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
        throw new TypeError("Expected a JSON object");
      return (
        "{" +
        Object.entries(v)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => `${JSON.stringify(k)}:${encode(x)}`)
          .join(",") +
        "}"
      );
    } finally {
      active.delete(v);
    }
  }
  return encode(value);
}
/** SHA-256 fingerprint of canonical UTF-8 JSON. */
export function fingerprint(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

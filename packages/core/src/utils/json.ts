/** Result of {@link safeJsonParse}. */
export type SafeJsonResult<T = unknown> = { ok: true; value: T } | { ok: false; error: string };

/** Parses JSON without throwing. */
export function safeJsonParse<T = unknown>(text: string): SafeJsonResult<T> {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

/**
 * Stringifies any value without throwing: handles cycles (`"[Circular]"`), `bigint`, `Error`,
 * `undefined` at the top level and functions. Use it for tool output before sending it to a model.
 */
export function safeJsonStringify(value: unknown, space?: number): string {
  const seen = new WeakSet<object>();
  try {
    const out = JSON.stringify(
      value,
      (_key, v: unknown) => {
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "function" || typeof v === "symbol") return undefined;
        if (v instanceof Error) return { name: v.name, message: v.message };
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        return v;
      },
      space,
    );
    return out ?? "null";
  } catch {
    return '"[Unserializable]"';
  }
}

/** Result of {@link truncate}. */
export interface TruncateResult {
  text: string;
  truncated: boolean;
}

/** Cuts `text` to at most `maxChars` characters and marks whether it was cut. */
export function truncate(text: string, maxChars: number): TruncateResult {
  if (text.length <= maxChars) return { text, truncated: false };
  const marker = "…[truncated]";
  const keep = Math.max(0, maxChars - marker.length);
  return { text: text.slice(0, keep) + marker, truncated: true };
}

/** The placeholder written in place of redacted values. */
export const REDACTED = "[REDACTED]";

/** Keys that are redacted by default by {@link redactKeys}. Matching ignores case. */
export const DEFAULT_SECRET_KEYS: readonly string[] = [
  "password",
  "passwd",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "creditcard",
  "cardnumber",
  "cvv",
  "ssn",
];

/**
 * Returns a deep copy of `value` with the values of matching keys replaced by `[REDACTED]`.
 * Matching ignores case and also strips `-` / `_`, so `api-key` matches `apikey`.
 */
export function redactKeys<T>(value: T, keys: readonly string[] = DEFAULT_SECRET_KEYS): T {
  const wanted = new Set(keys.map(normalizeKey));
  const walk = (v: unknown, depth: number): unknown => {
    if (depth > 20 || v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((item) => walk(item, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(v)) {
      out[k] = wanted.has(normalizeKey(k)) ? REDACTED : walk(inner, depth + 1);
    }
    return out;
  };
  return walk(value, 0) as T;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 10+ digit sequences, optionally with +, spaces or dashes (phone numbers, card numbers).
const LONG_NUMBER_RE = /\+?\d[\d\s-]{8,}\d/g;

/** Replaces email addresses and long digit sequences (phones, cards) in free text. */
export function redactText(text: string): string {
  return text.replace(EMAIL_RE, REDACTED).replace(LONG_NUMBER_RE, REDACTED);
}

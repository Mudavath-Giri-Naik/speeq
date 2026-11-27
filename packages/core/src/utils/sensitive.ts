/**
 * One list of "never show this" names and value shapes, shared by the compiler (which flags
 * fields) and the runtime (which drops them from context). Dependency-free, browser-safe.
 */

/** Split a name into lowercase words (camelCase, snake_case, kebab-case). */
export function nameWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const SINGLE = new Set(
  "password passwd pwd secret token cvv cvc otp pin ssn aadhaar iban".split(" "),
);
const JOINED = new Set("apikey cardnumber ccnumber accountnumber pannumber".split(" "));

/**
 * Does a field name look like a secret, card or identity number? Whole words only, so `pinCode`
 * matches but `pinterestUrl` and `panel` do not.
 */
export function isSensitiveName(name: string): boolean {
  const ws = nameWords(name);
  if (ws.some((w) => SINGLE.has(w))) return true;
  if (JOINED.has(ws.join(""))) return true;
  for (let i = 0; i + 1 < ws.length; i++) if (JOINED.has(`${ws[i]}${ws[i + 1]}`)) return true;
  return false;
}

const RESTRICTED_SINGLE = new Set(
  "cookie cookies credential credentials authorization bearer passport aadhar cvc2 pan".split(" "),
);
const RESTRICTED_JOINED = new Set(
  "privatekey secretkey accesskey sessionid sessiontoken routingnumber sortcode taxid nationalid passportnumber dateofbirth".split(
    " ",
  ),
);

/**
 * Stricter than {@link isSensitiveName}: also cookies, credentials, session ids, government ids
 * and dates of birth. Used to screen customer context before a model ever sees it.
 */
export function isRestrictedName(name: string): boolean {
  if (isSensitiveName(name)) return true;
  const ws = nameWords(name);
  if (ws.some((w) => RESTRICTED_SINGLE.has(w))) return true;
  const joined = ws.join("");
  if (RESTRICTED_JOINED.has(joined)) return true;
  for (let i = 0; i + 1 < ws.length; i++)
    if (RESTRICTED_JOINED.has(`${ws[i]}${ws[i + 1]}`)) return true;
  return false;
}

const JWT = /^eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}$/;
const HEX = /^[a-f0-9]{32,}$/i;
const OPAQUE = /^[A-Za-z0-9+/_=-]{40,}$/;
const KEY_PREFIX =
  /^(sk|rk|pk_live|sk_live|ghp|gho|github_pat|xox[abp]|AKIA|AIza)[-_A-Za-z0-9]{12,}$/;

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Does a value look like a secret: a JWT, an API key, a long hex or base64 token, or a valid
 * payment card number? Cheap and deterministic; it cannot catch everything, which is why context
 * is projected through an allow-list first.
 */
export function looksSecret(value: string): boolean {
  const v = value.trim();
  if (v.length < 13) return false;
  if (JWT.test(v) || HEX.test(v) || KEY_PREFIX.test(v)) return true;
  if (OPAQUE.test(v) && /\d/.test(v) && /[A-Za-z]/.test(v)) return true;
  const digits = v.replace(/[\s-]/g, "");
  return /^\d{13,19}$/.test(digits) && luhn(digits);
}

const SECRET_PARAMS = new Set(
  "token code key session auth email otp password secret signature sig access_token refresh_token id_token state nonce".split(
    " ",
  ),
);

/**
 * Removes query parameters that look like secrets or personal data from a path, keeping the rest:
 * `/reset?token=abc&step=2` becomes `/reset?token=[REDACTED]&step=2`.
 */
export function redactPath(path: string): string {
  const q = path.indexOf("?");
  if (q < 0) return path;
  const hashAt = path.indexOf("#", q);
  const query = path.slice(q + 1, hashAt < 0 ? undefined : hashAt);
  const parts = query.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    const name = decodeSafe(eq < 0 ? pair : pair.slice(0, eq));
    const value = eq < 0 ? "" : decodeSafe(pair.slice(eq + 1));
    const secret =
      SECRET_PARAMS.has(name.toLowerCase()) || isRestrictedName(name) || looksSecret(value);
    return secret && eq >= 0 ? `${pair.slice(0, eq)}=[REDACTED]` : pair;
  });
  return `${path.slice(0, q)}?${parts.join("&")}${hashAt < 0 ? "" : path.slice(hashAt)}`;
}

function decodeSafe(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, " "));
  } catch {
    return text;
  }
}

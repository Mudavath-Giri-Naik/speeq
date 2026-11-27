import { createHash } from "node:crypto";

/** Ownership of a path relative to the engine (ADR-0016). */
export type Ownership = "missing" | "owned" | "edited" | "foreign";

const FIRST_LINE = /^\/\/ speeq:generated sha256=([a-f0-9]{64})\n/;
/** sha256 hex of a string. */
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
/** Prefix a generated body with its ownership header. */
export function seal(body: string): string {
  const text = body.endsWith("\n") ? body : `${body}\n`;
  return `// speeq:generated sha256=${sha256(text)}\n${text}`;
}
/** `owned`: marker and hash match. `edited`: marker but the body changed. `foreign`: no marker. */
export function ownership(content: string | undefined): Ownership {
  if (content === undefined) return "missing";
  const m = FIRST_LINE.exec(content);
  if (!m) return "foreign";
  return sha256(content.slice(m[0].length)) === m[1] ? "owned" : "edited";
}

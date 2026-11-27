import { randomBytes } from "node:crypto";

/** A variable speeq asks the developer to fill in. Only the name and a note are written. */
export interface EnvName {
  name: string;
  note: string;
}

const NAME = /^[A-Z][A-Z0-9_]*$/;
const hasName = (text: string, name: string) =>
  text.split(/\r?\n/).some((line) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    return m?.[1] === name;
  });

/** A fresh `SPEEQ_SECRET` value: 48 URL-safe characters from the operating system's random source. */
export function newSecret(): string {
  return randomBytes(36).toString("base64url");
}

/**
 * The text to append to an env file so it contains every name in `names`. Existing names are never
 * touched, read out or duplicated, and their values are never inspected. New names get an empty
 * value and a comment, except `SPEEQ_SECRET` when `secret` is given (generated locally, not user data).
 * Returns `undefined` when nothing is missing. Keeps the file's line endings. `masked` is the same text
 * with the generated value hidden, for previews.
 */
export function planEnv(
  existing: string | undefined,
  names: readonly EnvName[],
  options: { secret?: string } = {},
): { append: string; added: string[]; masked: string } | undefined {
  const base = existing ?? "";
  const nl = base.includes("\r\n") ? "\r\n" : "\n";
  const missing = names.filter((n) => NAME.test(n.name) && !hasName(base, n.name));
  if (missing.length === 0) return undefined;
  const header = "# Added by speeq. Fill in the empty values, save, and restart the dev server.";
  const lines = [header];
  const masked = [header];
  for (const n of missing) {
    const note = `# ${n.note.replace(/[\r\n]+/g, " ")}`;
    const generated = n.name === "SPEEQ_SECRET" && options.secret !== undefined;
    lines.push(note, `${n.name}=${generated ? options.secret : ""}`);
    masked.push(note, `${n.name}=${generated ? "<generated>" : ""}`);
  }
  const lead = base === "" ? "" : base.endsWith("\n") ? nl : nl + nl;
  return {
    append: `${lead}${lines.join(nl)}${nl}`,
    added: missing.map((n) => n.name),
    masked: `${masked.join("\n")}\n`,
  };
}

/** True when a `.gitignore` already ignores `.env.local`. */
export function ignoresEnvLocal(gitignore: string): boolean {
  return gitignore.split(/\r?\n/).some((l) => {
    const t = l.trim().replace(/^\//, "");
    return t === ".env*" || t === ".env.local" || t === ".env*.local" || t === ".env";
  });
}

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

/** What {@link applyEnvValues} did. Names only: values are never reported. */
export interface EnvValueResult {
  text: string;
  /** Existing empty variables that now have a value. */
  filled: string[];
  /** Variables that were missing and are now at the end of the file. */
  added: string[];
  /** Variables that had a value and were overwritten (only when listed in `overwrite`). */
  replaced: string[];
  /** Variables that already have a value and were left alone. */
  skipped: string[];
}

const SAFE_VALUE = /^[A-Za-z0-9_.\-:/+=@~]+$/;
const LINE = (name: string) => new RegExp(`^(\\s*(?:export\\s+)?${name}\\s*=)(.*)$`);
const isEmptyValue = (rest: string) => /^\s*(?:(?:""|'')\s*)?(?:#.*)?$/.test(rest);

/**
 * Put values into an env file. The only place speeq writes a secret, and only because the developer
 * pasted it into the terminal. An existing empty variable is filled in place; a missing one is appended
 * with a short note; a variable that already has a value is left alone unless it is in `overwrite`.
 * Values are restricted to plain characters (keys and model ids), so nothing needs quoting and nothing
 * can add a line. Keeps the file's line endings. Never reports a value.
 */
export function applyEnvValues(
  existing: string | undefined,
  values: Readonly<Record<string, string>>,
  options: { overwrite?: readonly string[]; notes?: Readonly<Record<string, string>> } = {},
): EnvValueResult {
  const base = existing ?? "";
  const nl = base.includes("\r\n") ? "\r\n" : "\n";
  const lines = base === "" ? [] : base.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop(); // the file's final newline is added back below
  const result: EnvValueResult = { text: base, filled: [], added: [], replaced: [], skipped: [] };
  const append: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    if (!NAME.test(name)) throw new Error(`Not a valid variable name: ${name}`);
    if (!SAFE_VALUE.test(value))
      throw new Error(`The value for ${name} has characters speeq will not write.`);
    const re = LINE(name);
    const at: number[] = [];
    lines.forEach((l, i) => {
      if (re.test(l)) at.push(i);
    });
    if (at.length === 0) {
      const note = options.notes?.[name];
      if (note) append.push(`# ${note.replace(/[\r\n]+/g, " ")}`);
      append.push(`${name}=${value}`);
      result.added.push(name);
      continue;
    }
    const empty = at.every((i) => isEmptyValue(re.exec(lines[i] ?? "")?.[2] ?? ""));
    if (!empty && !options.overwrite?.includes(name)) {
      result.skipped.push(name);
      continue;
    }
    for (const i of at) lines[i] = `${re.exec(lines[i] ?? "")?.[1] ?? `${name}=`}${value}`;
    (empty ? result.filled : result.replaced).push(name);
  }
  if (append.length) {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    if (lines.length) lines.push("");
    lines.push(...append);
  }
  const changed = result.filled.length + result.replaced.length + result.added.length > 0;
  result.text = changed ? `${lines.join(nl)}${nl}` : base;
  return result;
}

/** True when a `.gitignore` already ignores `.env.local`. */
export function ignoresEnvLocal(gitignore: string): boolean {
  return gitignore.split(/\r?\n/).some((l) => {
    const t = l.trim().replace(/^\//, "");
    return t === ".env*" || t === ".env.local" || t === ".env*.local" || t === ".env";
  });
}

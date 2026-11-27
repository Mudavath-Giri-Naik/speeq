import type { ProviderEntry, VoiceEntry } from "./registry.js";
import { imp, STORE_LINES } from "./render.js";

const FACTORIES = [
  "createMockLLMProvider",
  "createGeminiProvider",
  "createOpenAICompatibleProvider",
];

/** The `llm: create...Provider(...)` call in a config file: where it starts and ends, and which factory it is. */
function findLlm(text: string): { start: number; end: number; factory: string } | undefined {
  const m = new RegExp(`\\bllm\\s*:\\s*(${FACTORIES.join("|")})\\s*\\(`).exec(text);
  if (!m) return undefined;
  const start = m.index + m[0].indexOf(m[1] ?? "");
  let depth = 0;
  let quote = "";
  for (let i = m.index + m[0].length - 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return { start, end: i + 1, factory: m[1] ?? "" };
  }
  return undefined;
}
const factoryOf = (p: ProviderEntry) => p.imports.flatMap((i) => i.names)[0] ?? "";
/** The environment variable that carries this provider's key, if it has one. */
export const keyVariable = (p: ProviderEntry) => p.env.find((e) => /API_KEY$/.test(e.name))?.name;

/**
 * Whether a config file's `llm` already matches a provider: the same factory and, for providers that
 * need a key, a read of that provider's key variable. `unknown` when no `llm` call is found.
 */
export function configProviderState(
  text: string,
  p: ProviderEntry,
): "match" | "mismatch" | "unknown" {
  const llm = findLlm(text);
  if (!llm) return "unknown";
  if (llm.factory !== factoryOf(p)) return "mismatch";
  const key = keyVariable(p);
  return key && !text.slice(llm.start, llm.end).includes(key) ? "mismatch" : "match";
}

/**
 * Rewrite the `llm` call (and its import) in a config file for another provider. Touches nothing else.
 * Returns a reason instead when the file does not have the expected shape, so the caller can show a
 * snippet and leave the file alone.
 */
export function switchProvider(
  text: string,
  p: ProviderEntry,
): { text: string } | { reason: string } {
  const llm = findLlm(text);
  if (!llm) return { reason: "no `llm: create...Provider(...)` call was found" };
  let out = `${text.slice(0, llm.start)}${p.expression}${text.slice(llm.end)}`;
  const next = factoryOf(p);
  if (llm.factory === next) return { text: out };
  const old = new RegExp(
    `^import\\s*\\{[^}]*\\b${llm.factory}\\b[^}]*\\}\\s*from\\s*["'][^"']+["'];?[ \\t]*\\r?\\n`,
    "m",
  );
  const oldImports = out.match(new RegExp(old.source, "gm")) ?? [];
  if (oldImports.length !== 1) return { reason: `the import of ${llm.factory} was not found once` };
  if (/,/.test(oldImports[0]?.match(/\{([^}]*)\}/)?.[1] ?? ""))
    return { reason: `the import of ${llm.factory} also imports other names` };
  const nl = out.includes("\r\n") ? "\r\n" : "\n";
  const fresh = p.imports
    .filter(
      (i) => !new RegExp(`^import\\s*\\{[^}]*\\b${i.names[0]}\\b[^}]*\\}\\s*from`, "m").test(out),
    )
    .map((i) => imp(`{ ${i.names.join(", ")} }`, i.from))
    .join(nl);
  out = out.replace(old, fresh ? `${fresh}${nl}` : "");
  return { text: out };
}

/** End of a property value that starts at `from`: the index of the first top-level `,` or closing brace. */
function valueEnd(text: string, from: number): number | undefined {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const close = text.indexOf("*/", i + 2);
      if (close < 0) return undefined;
      i = close + 1;
    } else if (c === '"' || c === "'" || c === "`") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) return i;
      depth--;
    } else if (c === "," && depth === 0) return i;
  }
  return undefined;
}

/** The `speech: ...,` property of the config object, from its line start to just after its comma. */
function findSpeech(text: string): { start: number; end: number } | undefined {
  const m = /^[ \t]*speech\s*:/m.exec(text);
  if (!m) return undefined;
  const end = valueEnd(text, m.index + m[0].length);
  if (end === undefined) return undefined;
  const stop = text[end] === "," ? end + 1 : end;
  const eol = /^[ \t]*\r?\n/.exec(text.slice(stop));
  // Take the comment lines directly above the property with it (the generated block has one).
  let start = m.index;
  for (;;) {
    const before = text.slice(0, start).replace(/\r?\n$/, "");
    const lineStart = before.lastIndexOf("\n") + 1;
    if (!/^[ \t]*\/\//.test(before.slice(lineStart))) break;
    start = lineStart;
  }
  return { start, end: stop + (eol ? eol[0].length : 0) };
}
const VOICE_FACTORIES = ["createSpeechConfig", "createSarvamStt"];
/** Whether a config's `speech` property already matches a voice choice. */
export function configVoiceState(text: string, v: VoiceEntry): "match" | "mismatch" | "unknown" {
  if (!/\bcreateSpeeq\s*\(/.test(text)) return "unknown";
  const at = findSpeech(text);
  if (v.config.length === 0) return at ? "mismatch" : "match";
  if (!at) return "mismatch";
  const block = text.slice(at.start, at.end);
  const mine = new Set(v.imports.flatMap((i) => i.names));
  const foreign = VOICE_FACTORIES.filter((n) => !mine.has(n) && block.includes(n));
  return [...mine].every((n) => block.includes(n)) && foreign.length === 0 ? "match" : "mismatch";
}

const SPEECH_NAMES = ["createSpeechConfig", "createSarvamStt", "createSarvamTts"];

/**
 * Change the `speech` property (and its imports) of a config to match a voice choice. Browser and text
 * voices need no `speech`, so the property is removed. Returns a reason instead of guessing when the
 * file has no `createSpeeq(` call or the place for the property cannot be found.
 */
export function switchVoice(text: string, v: VoiceEntry): { text: string } | { reason: string } {
  if (!/\bcreateSpeeq\s*\(/.test(text)) return { reason: "no createSpeeq(...) call was found" };
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const block = v.config.length ? `${v.config.join(nl)}${nl}` : "";
  let out = text;
  const at = findSpeech(text);
  if (at) out = `${text.slice(0, at.start)}${block}${text.slice(at.end)}`;
  else if (block) {
    const llm = /^[ \t]*llm\s*:/m.exec(text);
    const end = llm ? valueEnd(text, llm.index + llm[0].length) : undefined;
    if (!llm || end === undefined || text[end] !== ",")
      return { reason: "the place for the speech setting was not found" };
    const eol = text.indexOf("\n", end);
    const cut = eol < 0 ? text.length : eol + 1;
    out = `${text.slice(0, cut)}${block}${text.slice(cut)}`;
  }
  // Imports: drop speech factories nothing uses any more, then add the ones this voice needs.
  const body = out.replace(/^import[^;]*;[ \t]*\r?\n/gm, "");
  const unused = (n: string) => SPEECH_NAMES.includes(n) && !new RegExp(`\\b${n}\\b`).test(body);
  out = out.replace(
    /^import\s*\{([^}]*)\}\s*from\s*(["'][^"']+["']);?[ \t]*\r?\n/gm,
    (line, list: string, from: string) => {
      const kept = list
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n && !unused(n));
      if (kept.length === list.split(",").filter((n) => n.trim()).length) return line;
      return kept.length ? `${imp(`{ ${kept.join(", ")} }`, from.slice(1, -1))}${nl}` : "";
    },
  );
  for (const i of v.imports) {
    const missing = i.names.filter(
      (n) => !new RegExp(`^import[^;]*\\b${n}\\b[^;]*from`, "m").test(out),
    );
    if (!missing.length) continue;
    const found = [...out.matchAll(/^import[^;]*;[ \t]*\r?\n/gm)];
    const last = found[found.length - 1];
    const where = last ? last.index + last[0].length : 0;
    out = `${out.slice(0, where)}${imp(`{ ${missing.join(", ")} }`, i.from)}${nl}${out.slice(where)}`;
  }
  return { text: out };
}

const STORE_PROPERTY = /^([ \t]*)store\s*:\s*createMemoryStore\(\)\s*,/m;
/**
 * Whether the config keeps its in-memory store across hot reloads. `match` also covers configs that use
 * another store (nothing to change) and files without a `createMemoryStore()` call.
 */
export function configStoreState(text: string): "match" | "mismatch" {
  return STORE_PROPERTY.test(text) && !text.includes("__speeqStore") ? "mismatch" : "match";
}
/** Rewrite `store: createMemoryStore(),` so conversations survive hot reloads in development. */
export function keepStoreAcrossReloads(text: string): { text: string } | { reason: string } {
  if (configStoreState(text) === "match") return { text };
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const decl = STORE_LINES.join(nl);
  const anchor = /^export\s+const\s+\w+\s*=\s*createSpeeq\s*\(/m.exec(text);
  if (!anchor) return { reason: "no `export const ... = createSpeeq(` was found" };
  const out = text.replace(STORE_PROPERTY, "$1store,");
  const at = out.indexOf(anchor[0]);
  return { text: `${out.slice(0, at)}${decl}${nl}${nl}${out.slice(at)}` };
}

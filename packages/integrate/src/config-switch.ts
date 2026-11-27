import type { ProviderEntry } from "./registry.js";
import { imp } from "./render.js";

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

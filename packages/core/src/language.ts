/** Writing systems used by the lightweight language heuristic. */
export type ScriptName =
  | "latin"
  | "devanagari"
  | "telugu"
  | "tamil"
  | "kannada"
  | "malayalam"
  | "bengali"
  | "gujarati"
  | "gurmukhi"
  | "odia"
  | "arabic";
const scripts: Record<ScriptName, [RegExp, string]> = {
  latin: [/\p{Script=Latin}/u, "en"],
  devanagari: [/\p{Script=Devanagari}/u, "hi"],
  telugu: [/\p{Script=Telugu}/u, "te"],
  tamil: [/\p{Script=Tamil}/u, "ta"],
  kannada: [/\p{Script=Kannada}/u, "kn"],
  malayalam: [/\p{Script=Malayalam}/u, "ml"],
  bengali: [/\p{Script=Bengali}/u, "bn"],
  gujarati: [/\p{Script=Gujarati}/u, "gu"],
  gurmukhi: [/\p{Script=Gurmukhi}/u, "pa"],
  odia: [/\p{Script=Oriya}/u, "or"],
  arabic: [/\p{Script=Arabic}/u, "ur"],
};
/** Extract the normalized primary language subtag. */
export function baseLanguage(tag: string) {
  return tag.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";
}
/** Return a two-letter primary language when the tag has one. */
export function toIso639_1(tag: string) {
  try {
    const base = new Intl.Locale(baseLanguage(tag)).language;
    return /^[a-z]{2}$/.test(base) ? base : undefined;
  } catch {
    return undefined;
  }
}
/** Count letters in each script, excluding digits and punctuation. */
export function detectScripts(text: string) {
  const counts: Partial<Record<ScriptName, number>> = {};
  let dominant: ScriptName | undefined;
  const entries = Object.entries(scripts) as [ScriptName, [RegExp, string]][];
  for (const c of text) {
    if (!/\p{L}/u.test(c)) continue;
    const name = entries.find(([, s]) => s[0].test(c))?.[0];
    if (!name) continue;
    const count = (counts[name] ?? 0) + 1;
    counts[name] = count;
    if (!dominant || count > (counts[dominant] ?? 0)) dominant = name;
  }
  return { counts, dominant, mixed: Object.keys(counts).length > 1 };
}
/** Infer a candidate language from script evidence, leaving shared Devanagari unresolved. */
export function guessLanguageFromScript(text: string, candidates: readonly string[]) {
  const { counts, dominant, mixed } = detectScripts(text);
  if (!dominant) return { confidence: 0, mixed };
  if (
    dominant === "devanagari" &&
    candidates.some((c) => ["mr", "ne", "sa"].includes(baseLanguage(c)))
  )
    return { confidence: 0.3, mixed };
  const language = candidates.find((c) => baseLanguage(c) === scripts[dominant][1]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { language, confidence: language ? (counts[dominant] ?? 0) / total : 0, mixed };
}

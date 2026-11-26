/**
 * Fixes the words that browser speech recognition often gets wrong on this site: the product
 * name, tech terms, and a few common slips. Runs on every interim phrase, so it only uses cheap,
 * pure rules. It is passed to speeq as `call.correct`.
 */

const NAME = "speeq";

/** Words around "speak" that show the visitor means the product, not the verb. */
const BEFORE =
  /\b(what is|what's|about|use|using|install|installing|with|of|the|is|does|in|for|to)$/i;
const AFTER =
  /^(sdk|package|packages|docs|doc|client|server|react|provider|works?|does|is|has|supports?|library|assistant|guide|project|npm|api|hook|hooks|call|calls)\b/i;

const PHRASES: Array<[RegExp, string]> = [
  [/\bspeed\s*(q|queue|cue|que)\b/gi, NAME],
  [/\bspeak\s*(q|queue|cue|que)\b/gi, NAME],
  [/\bspee(k|c|ck)\b/gi, NAME],
  [/\bspeaq\b/gi, NAME],
  [/\bspeeque?\b/gi, NAME],
  [/\bnext\s*(dot\s*)?(js|j s)\b/gi, "Next.js"],
  [/\breact\s*(dot\s*)?(js|j s)\b/gi, "React"],
  [/\btype\s+script\b/gi, "TypeScript"],
  [/\bjava\s+script\b/gi, "JavaScript"],
  [/\bopen\s+a\s*i\b/gi, "OpenAI"],
  [/\bmongo\s*d\s*b\b/gi, "MongoDB"],
  [/\bmongo\s+db\b/gi, "MongoDB"],
  [/\bgit\s+hub\b/gi, "GitHub"],
  [/\bver\s*(sell|cell|sel)\b/gi, "Vercel"],
  [/\bgrok\b/gi, "Groq"],
  [/\bgemini\b/gi, "Gemini"],
  [/\bo\s*auth\b/gi, "OAuth"],
  [/\ba\s*p\s*i\b/gi, "API"],
  [/\bs\s*d\s*k\b/gi, "SDK"],
  [/\bc\s*l\s*i\b/gi, "CLI"],
  [/\bquick\s+start\b/gi, "quickstart"],
  [/\baudit\s+(lock|lug)\b/gi, "audit log"],
  [/\bweb\s+speech\s+a\s*p\s*i\b/gi, "Web Speech API"],
  [/\b(the|the)\s+(the)\b/gi, "the"],
];

const QUESTION =
  /^(how|what|why|when|where|which|who|can|could|does|do|is|are|will|should|would)\b/i;

export function correctTranscript(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  if (!out) return out;
  for (const [pattern, replacement] of PHRASES) out = out.replace(pattern, replacement);
  // "speak" alone is a real word, so only change it when the words around it point to the product.
  out = out.replace(/\bspeak\b/gi, (match, offset: number, whole: string) => {
    const before = whole.slice(0, offset).trimEnd();
    const after = whole.slice(offset + match.length).trimStart();
    return BEFORE.test(before) && (AFTER.test(after) || after === "")
      ? NAME
      : AFTER.test(after)
        ? NAME
        : match;
  });
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (QUESTION.test(out) && !/[?.!]$/.test(out)) out += "?";
  return out;
}

import { baseLanguage } from "../language.js";
/** Canonical domain term, spoken forms and relative hint priority. */
export interface VocabularyTerm {
  term: string;
  aliases?: readonly string[];
  pronunciations?: readonly string[];
  regional?: Readonly<Record<string, readonly string[]>>;
  protected?: boolean;
  weight?: number;
}
/** Developer-owned terminology. */
export interface Vocabulary {
  terms: readonly VocabularyTerm[];
}
/** One deterministic replacement in a transcript. */
export interface CorrectionChange {
  from: string;
  to: string;
  term: string;
  kind: "alias" | "regional" | "fuzzy";
}
/** Original transcript, corrected display text and unresolved spans. */
export interface CorrectionResult {
  raw: string;
  text: string;
  changes: readonly CorrectionChange[];
  ambiguous: readonly { span: string; candidates: readonly string[] }[];
}
/** Optional correction controls. */
export interface CorrectionOptions {
  language?: string;
  regionalToCanonical?: boolean;
  fuzzy?: boolean;
}
const lex = /[\p{L}\p{M}\p{N}_\u200c\u200d]+|[^\s]/gu;
const fold = (s: string) => s.normalize("NFC").toLowerCase();
const words = (s: string) => Array.from(s.matchAll(lex), (m) => fold(m[0]));
const latin = /^\p{Script=Latin}{5,}$/u;
type Entry = { term: VocabularyTerm; kind: "canonical" | "alias" | "regional"; language?: string };
type Trie = { next: Map<string, Trie>; entries: Entry[] };
const node = (): Trie => ({ next: new Map(), entries: [] });
// Prefix deletion keys bound lookup work independently of vocabulary size.
function deletionKeys(word: string, edits: number) {
  const keys = new Set([word.slice(0, 8)]);
  let frontier = [...keys];
  for (let edit = 0; edit < edits; edit++) {
    const next: string[] = [];
    for (const form of frontier)
      for (let i = 0; i < form.length; i++) {
        const shortened = form.slice(0, i) + form.slice(i + 1);
        if (!keys.has(shortened)) {
          keys.add(shortened);
          next.push(shortened);
        }
      }
    frontier = next;
  }
  return keys;
}
function build(v: Vocabulary) {
  const root = node();
  const fuzzy = new Map<string, Set<VocabularyTerm>>();
  function add(s: string, entry: Entry) {
    let n = root;
    for (const token of words(s)) {
      let child = n.next.get(token);
      if (!child) {
        child = node();
        n.next.set(token, child);
      }
      n = child;
    }
    n.entries.push(entry);
    const key = fold(s);
    if (entry.kind !== "regional" && !entry.term.protected && latin.test(key)) {
      const set = fuzzy.get(key) ?? new Set();
      set.add(entry.term);
      fuzzy.set(key, set);
    }
  }
  for (const source of v.terms) {
    const term = /\p{N}|[@$₹€£]|:\/\//u.test(source.term) ? { ...source, protected: true } : source;
    add(term.term, { term, kind: "canonical" });
    for (const a of term.aliases ?? []) add(a, { term, kind: "alias" });
    for (const [language, forms] of Object.entries(term.regional ?? {}))
      for (const f of forms) add(f, { term, kind: "regional", language });
  }
  for (const term of v.terms)
    if (term.protected || /\p{N}|[@$₹€£]|:\/\//u.test(term.term)) {
      for (const name of [
        term.term,
        ...(term.aliases ?? []),
        ...Object.values(term.regional ?? {}).flat(),
      ])
        fuzzy.delete(fold(name));
    }
  const buckets = new Map<string, string[]>();
  for (const form of fuzzy.keys())
    for (const key of deletionKeys(form, 2)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(form);
      else buckets.set(key, [form]);
    }
  return { root, fuzzy, buckets };
}
const indexes = new WeakMap<Vocabulary, ReturnType<typeof build>>();
/** Prepare lookup tables once for a readonly vocabulary. @internal */
export function indexFor(v: Vocabulary) {
  let i = indexes.get(v);
  if (!i) {
    i = build(v);
    indexes.set(v, i);
  }
  return i;
}
function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + Number(a[i - 1] !== b[j - 1]),
      );
      row.push(cost);
      best = Math.min(best, cost);
    }
    if (best > limit) return limit + 1;
    prev = row;
  }
  return prev[b.length] ?? limit + 1;
}
function nearest(word: string, index: ReturnType<typeof build>) {
  let best = word.length < 9 ? 1 : 2;
  const hits = new Set<string>();
  const candidates = new Set<string>();
  for (const key of deletionKeys(word, best))
    for (const form of index.buckets.get(key) ?? []) candidates.add(form);
  for (const form of candidates) {
    const terms = index.fuzzy.get(form) ?? [];
    const d = distance(word, form, best);
    if (d > best) continue;
    if (d < best) {
      best = d;
      hits.clear();
    }
    for (const t of terms) hits.add(t.term);
  }
  const result = [...hits].sort();
  return result;
}
const protectedPattern =
  /(?:https?:\/\/|www\.)[^\s]+|(?:[$₹€£]\s*|(?:rupees|dollars)\s+)\p{N}[\p{N},.]*(?:\s*%)?|\p{N}+[\s/-]+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b|\p{N}[\p{N},.]*\s*(?:rupees|dollars|%)/giu;
/** Correct whole spans conservatively and preserve all unmatched original characters. */
export function correctWithVocabulary(
  text: string,
  vocab: Vocabulary,
  options: CorrectionOptions = {},
): CorrectionResult {
  const index = indexFor(vocab),
    tokens = Array.from(text.matchAll(lex));
  const changes: CorrectionChange[] = [],
    ambiguous: { span: string; candidates: string[] }[] = [];
  const blocked = new Uint8Array(tokens.length);
  let pos = 0;
  const spans = Array.from(text.matchAll(protectedPattern));
  for (const m of text.matchAll(/\S+/gu)) {
    if (/\p{N}/u.test(m[0])) spans.push(m);
    else if (/^(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?:[/?#]\S*)?$/iu.test(m[0])) spans.push(m);
    else if (m[0].includes("@") && /^[^@]+@[^@]+\.[^@]+$/u.test(m[0])) spans.push(m);
  }
  spans.sort((a, b) => a.index - b.index);
  for (const m of spans) {
    while (
      pos < tokens.length &&
      (tokens[pos]?.index ?? 0) + (tokens[pos]?.[0].length ?? 0) <= m.index
    )
      pos++;
    while (pos < tokens.length && (tokens[pos]?.index ?? Infinity) < m.index + m[0].length)
      blocked[pos++] = 1;
  }
  const keys = tokens.map((m) => fold(m[0]));
  function matches(i: number) {
    const list: { end: number; entries: Entry[] }[] = [];
    let n: Trie | undefined = index.root;
    for (let j = i; j < keys.length; j++) {
      n = n.next.get(keys[j] ?? "");
      if (!n) break;
      if (n.entries.length) list.push({ end: j + 1, entries: n.entries });
    }
    return list;
  }
  for (let i = 0; i < keys.length; i++) {
    if (/\p{N}/u.test(keys[i] ?? "")) blocked[i] = 1;
    for (const m of matches(i))
      if (m.entries.some((e) => e.term.protected)) blocked.fill(1, i, m.end);
  }
  let result = "",
    cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const first = tokens[i];
    if (!first || blocked[i]) continue;
    let end = i + 1,
      kind: CorrectionChange["kind"] = "fuzzy",
      names: string[] = [];
    let exact = false;
    const matchesHere = matches(i)
      .reverse()
      .filter((m) => !blocked.subarray(i, m.end).includes(1));
    // Exact spellings outrank regional equivalents, then prefer the longest whole phrase.
    for (const regional of [false, true]) {
      if (regional && options.regionalToCanonical === false) break;
      for (const match of matchesHere) {
        const forms = match.entries.filter((e) => (e.kind === "regional") === regional);
        if (!forms.length) continue;
        end = match.end;
        exact = true;
        kind = regional ? "regional" : "alias";
        names = [...new Set(forms.map((e) => e.term.term))].sort();
        if (names.length === 1 && forms.some((e) => e.kind === "canonical")) names = [];
        break;
      }
      if (exact) break;
    }
    if (!exact && options.fuzzy !== false && latin.test(keys[i] ?? ""))
      names = nearest(keys[i] ?? "", index);
    const last = tokens[end - 1] ?? first;
    const finish = last.index + last[0].length;
    const span = text.slice(first.index, finish);
    if (names.length > 1) ambiguous.push({ span, candidates: names });
    else if (names[0] && names[0] !== span) {
      result += text.slice(cursor, first.index) + names[0];
      cursor = finish;
      changes.push({ from: span, to: names[0], term: names[0], kind });
    }
    i = end - 1;
  }
  return { raw: text, text: result + text.slice(cursor), changes, ambiguous };
}
function ranked(v: Vocabulary) {
  return [...v.terms].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
}
/** Most important canonical terms for native hints and agent instructions. */
export function vocabularyHints(v: Vocabulary, max = 50) {
  return [...new Set(ranked(v).map((t) => t.term))].slice(0, Math.max(0, max));
}
/** Build a bounded recognizer prompt without splitting a term. */
export function sttPromptFromVocabulary(
  v: Vocabulary,
  options: { language?: string; maxChars?: number } = {},
) {
  let result = "";
  for (const t of ranked(v)) {
    const forms = [
      t.term,
      ...(t.pronunciations ?? []),
      ...(t.regional?.[baseLanguage(options.language ?? "")] ?? []),
    ];
    for (const form of forms) {
      const next = [result, form].filter(Boolean).join(", ");
      if (next.length <= (options.maxChars ?? 224)) result = next;
    }
  }
  return result;
}
/** Low-priority terms derived from host routes and tools. */
export function autoVocabulary(input: {
  routes?: readonly { id: string; title: string }[];
  tools?: readonly { name: string; title?: string }[];
}): Vocabulary {
  return {
    terms: [...(input.routes ?? [])]
      .map((r) => ({ term: r.title, weight: 0 }))
      .concat((input.tools ?? []).map((t) => ({ term: t.title ?? t.name, weight: 0 }))),
  };
}

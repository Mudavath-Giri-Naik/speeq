import { defineKnowledgeSource } from "speeq/server";
import { getAllDocs } from "../content";
import { routeIdFor } from "./pages";

interface Section {
  /** "<route id>#<heading id>" or just "<route id>". */
  id: string;
  title: string;
  text: string;
  href: string;
  counts: Map<string, number>;
  titleWords: Set<string>;
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "and",
  "in",
  "is",
  "it",
  "that",
  "this",
  "for",
  "on",
  "how",
  "do",
  "i",
  "you",
  "what",
  "can",
  "does",
  "with",
  "my",
  "me",
  "are",
  "be",
  "or",
]);

/** Light stemming so "confirmations" matches "confirmation" and "installing" matches "install". */
function stem(word: string): string {
  return word.length > 4 ? word.replace(/(ing|ed|es|s)$/, "") : word;
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => !STOP.has(w) && w.length > 1)
    .map(stem);
}

function count(list: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of list) map.set(w, (map.get(w) ?? 0) + 1);
  return map;
}

function plain(markdown: string): string {
  return markdown
    .replace(/````[\s\S]*?````/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/gm, "")
    .replace(/^\|.*\|$/gm, " ")
    .replace(/[*_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

let cache: Section[] | null = null;

/** Split every doc into sections (one per heading) so answers can point at a precise place. */
function sections(): Section[] {
  if (cache) return cache;
  const out: Section[] = [];
  for (const doc of getAllDocs()) {
    const routeId = routeIdFor(doc.slug);
    const body = doc.body.trim().replace(/^#\s.*\n+/, "");
    const parts = body.split(/^##\s+/m);
    const intro = parts.shift() ?? "";
    const add = (title: string, anchor: string | null, raw: string) => {
      const text = plain(raw);
      if (text.length < 20) return;
      const full = `${doc.title}: ${title}`;
      out.push({
        id: anchor ? `${routeId}#${anchor}` : routeId,
        title: full,
        text,
        href: `/docs/${doc.slug}${anchor ? `#${anchor}` : ""}`,
        counts: count(words(`${title} ${text}`)),
        titleWords: new Set(words(`${full} ${routeId.replace(/-/g, " ")}`)),
      });
    };
    add(doc.title, null, `${doc.description}. ${intro}`);
    for (const part of parts) {
      const newline = part.indexOf("\n");
      const heading = (newline < 0 ? part : part.slice(0, newline)).trim();
      add(heading, slugify(heading), newline < 0 ? "" : part.slice(newline + 1));
    }
  }
  cache = out;
  return out;
}

/** Rank doc sections for a spoken question. Pure and fast, so answers start streaming at once. */
export function searchDocs(query: string, limit = 4): Section[] {
  const wanted = words(query);
  if (wanted.length === 0) return [];
  const scored = sections()
    .map((section) => {
      let score = 0;
      let hits = 0;
      for (const w of wanted) {
        const inBody = section.counts.get(w) ?? 0;
        if (section.titleWords.has(w)) {
          score += 8 + Math.min(inBody, 3);
          hits++;
        } else if (inBody > 0) {
          score += Math.min(inBody, 4);
          hits++;
        }
      }
      return { section, score: hits === 0 ? 0 : score + hits };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.section);
}

/** The docs as a speeq knowledge source. */
export const docsKnowledge = defineKnowledgeSource({
  id: "docs",
  description:
    "The speeq documentation: what speeq is, install, guides, concepts, settings, protocol, errors, privacy, security. Hit ids look like '<route id>#<section>'.",
  async search(query) {
    return searchDocs(query).map((s) => ({
      id: s.id,
      title: s.title,
      content: s.text.slice(0, 700),
      href: s.href,
    }));
  },
});

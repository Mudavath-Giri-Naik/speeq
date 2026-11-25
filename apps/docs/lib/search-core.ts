export interface SearchEntry {
  slug: string;
  title: string;
  section: string;
  description: string;
  headings: { id: string; text: string }[];
  text: string;
}
export interface SearchHit {
  slug: string;
  title: string;
  section: string;
  /** Anchor of the best matching heading, if the match was in a heading. */
  anchor?: string;
  heading?: string;
  snippet: string;
  score: number;
}

export function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokens(query: string): string[] {
  return normalize(query)
    .split(/[^a-z0-9_@./-]+/)
    .filter((t) => t.length > 0);
}

function snippetAround(text: string, needle: string): string {
  const lower = normalize(text);
  const at = lower.indexOf(needle);
  if (at < 0) return text.slice(0, 120);
  const start = Math.max(0, at - 40);
  const end = Math.min(text.length, at + needle.length + 90);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** Rank pages for a query. A title match beats a heading match, which beats body text. */
export function search(entries: SearchEntry[], query: string, limit = 8): SearchHit[] {
  const words = tokens(query);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const title = normalize(entry.title);
    const desc = normalize(entry.description);
    const body = normalize(entry.text);
    let score = 0;
    let anchor: string | undefined;
    let heading: string | undefined;
    let snippet = entry.description || entry.text.slice(0, 120);
    let matchedAll = true;
    for (const word of words) {
      let wordScore = 0;
      if (title === word) wordScore += 100;
      else if (title.startsWith(word)) wordScore += 70;
      else if (title.includes(word)) wordScore += 50;
      const headingHit = entry.headings.find((h) => normalize(h.text).includes(word));
      if (headingHit) {
        wordScore += 30;
        if (!anchor) {
          anchor = headingHit.id;
          heading = headingHit.text;
        }
      }
      if (desc.includes(word)) wordScore += 12;
      if (body.includes(word)) {
        wordScore += 6;
        if (wordScore === 6) snippet = snippetAround(entry.text, word);
      }
      if (wordScore === 0) matchedAll = false;
      score += wordScore;
    }
    if (!matchedAll || score === 0) continue;
    hits.push({
      slug: entry.slug,
      title: entry.title,
      section: entry.section,
      anchor,
      heading,
      snippet,
      score,
    });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

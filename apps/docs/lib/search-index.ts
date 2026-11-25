import { findNav } from "../content/nav";
import { getAllDocs, getDoc } from "./content";
import type { SearchEntry } from "./search-core";

/** Build the search index once at build time. Kept small: headings plus a body excerpt. */
export async function buildSearchIndex(): Promise<SearchEntry[]> {
  const entries: SearchEntry[] = [];
  for (const meta of getAllDocs()) {
    const doc = await getDoc(meta.slug);
    if (!doc) continue;
    entries.push({
      slug: meta.slug,
      title: meta.title,
      section: findNav(meta.slug)?.section.title ?? "Docs",
      description: meta.description,
      headings: doc.headings.map((h) => ({ id: h.id, text: h.text })),
      text: doc.text.slice(0, 1500),
    });
  }
  return entries;
}

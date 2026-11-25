import { defineRoute } from "speeq/server";
import { z } from "zod";
import { flatNav, nav } from "../../content/nav";
import { getAllDocs } from "../content";

export interface GuidePage {
  /** Route id, like "guides-tools". Search hit ids start with it. */
  id: string;
  title: string;
  path: string;
  description: string;
  section: string;
}

const EXTRA: Record<string, string> = {
  packages: "All ten speeq packages with their live version and weekly installs.",
  releases: "Every published version of speeq, newest first.",
};

export const routeIdFor = (slug: string) => slug.replace(/\//g, "-");

/** Every page of the website: the home page, the adoption page and all documentation pages. */
export function guidePages(): GuidePage[] {
  const docs = new Map(getAllDocs().map((d) => [d.slug, d]));
  const pages: GuidePage[] = [
    {
      id: "home",
      title: "Home",
      path: "/",
      description: "The home page with the live demo.",
      section: "Site",
    },
    {
      id: "adoption",
      title: "Adoption",
      path: "/stats",
      description: "Live npm installs, versions, and GitHub numbers for speeq.",
      section: "Site",
    },
  ];
  for (const section of nav) {
    for (const page of section.pages) {
      pages.push({
        id: routeIdFor(page.slug),
        title: page.title,
        path: `/docs/${page.slug}`,
        description: docs.get(page.slug)?.description ?? EXTRA[page.slug] ?? page.title,
        section: section.title,
      });
    }
  }
  return pages;
}

const sectionParam = z.object({
  section: z
    .string()
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .describe("Heading id inside the page to scroll to, like your-first-tool."),
});

/** One speeq route for every page, so the assistant can take a visitor anywhere on the site. */
export function guideRoutes() {
  return guidePages().map((page) =>
    defineRoute({
      id: page.id,
      title: page.title,
      path: page.path,
      description: page.description,
      params: sectionParam,
    }),
  );
}

const STOP = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "me",
  "my",
  "page",
  "section",
  "docs",
  "doc",
  "please",
  "for",
  "on",
  "about",
  "and",
  "in",
  "is",
  "it",
  "up",
  "that",
  "this",
]);

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w));
}

/** Pick the page that best matches words like "pricing" or "the audit log". Used by the offline guide. */
export function findPage(query: string, pages: GuidePage[] = guidePages()): GuidePage | null {
  const wanted = words(query);
  if (wanted.length === 0) return null;
  let best: GuidePage | null = null;
  let bestScore = 0;
  for (const page of pages) {
    const title = new Set(words(page.title));
    const slug = new Set(words(page.id));
    const body = new Set(words(page.description));
    let score = 0;
    for (const w of wanted) {
      if (title.has(w)) score += 6;
      else if (slug.has(w)) score += 4;
      else if (body.has(w)) score += 1;
      else if ([...title].some((t) => t.startsWith(w) || w.startsWith(t))) score += 2;
    }
    if (page.id === "home" && wanted.includes("home")) score += 6;
    if (score > bestScore) {
      best = page;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

export const pageCount = () => flatNav.length + 2;

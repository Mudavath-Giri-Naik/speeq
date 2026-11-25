import { describe, expect, it } from "vitest";
import { flatNav, nav } from "../content/nav";
import { getAllDocs, markdownSlugs } from "../lib/content";

const docs = getAllDocs();
const customSlugs = flatNav.filter((p) => p.custom).map((p) => p.slug);

describe("navigation", () => {
  it("has a markdown file for every non-custom page", () => {
    const slugs = new Set(docs.map((d) => d.slug));
    for (const slug of markdownSlugs()) expect(slugs.has(slug), `missing ${slug}`).toBe(true);
  });

  it("has no orphan markdown files", () => {
    const listed = new Set(flatNav.map((p) => p.slug));
    for (const doc of docs) expect(listed.has(doc.slug), `orphan ${doc.slug}`).toBe(true);
  });

  it("uses unique slugs and titles", () => {
    const slugs = flatNav.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    const titles = docs.map((d) => d.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("gives every page a title and a one sentence description", () => {
    for (const doc of docs) {
      expect(doc.title.length, doc.slug).toBeGreaterThan(2);
      expect(doc.description.length, `${doc.slug} description`).toBeGreaterThan(20);
    }
  });

  it("has sections with pages", () => {
    for (const section of nav) expect(section.pages.length).toBeGreaterThan(0);
  });
});

describe("links", () => {
  const known = new Set([...docs.map((d) => d.slug), ...customSlugs]);
  const anchors = new Map<string, Set<string>>();
  for (const doc of docs) {
    const ids = new Set<string>();
    for (const m of doc.body.matchAll(/^#{2,3}\s+(.+)$/gm)) {
      ids.add(
        (m[1] as string)
          .toLowerCase()
          .replace(/`/g, "")
          .replace(/[^\w\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-"),
      );
    }
    anchors.set(doc.slug, ids);
  }

  it("resolves every internal /docs link and anchor", () => {
    for (const doc of docs) {
      const stripped = doc.body.replace(/````[\s\S]*?````/g, "").replace(/```[\s\S]*?```/g, "");
      for (const m of stripped.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        const href = m[1] as string;
        const [path = "", hash] = href.split("#");
        if (path === "/stats" || path === "/") continue;
        expect(path.startsWith("/docs/"), `${doc.slug}: ${href}`).toBe(true);
        const slug = path.replace(/^\/docs\//, "");
        expect(known.has(slug), `${doc.slug} links to missing ${href}`).toBe(true);
        if (hash) expect(anchors.get(slug)?.has(hash), `${doc.slug}: ${href}`).toBe(true);
      }
    }
  });

  it("never links to a relative .md file", () => {
    for (const doc of docs) expect(doc.body, doc.slug).not.toMatch(/\]\((?!http)[^)]*\.md\)/);
  });
});

describe("content hygiene", () => {
  it("contains no real-looking secrets or local env values", () => {
    for (const doc of docs) {
      expect(doc.body, doc.slug).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
      expect(doc.body, doc.slug).not.toMatch(/\bsk-[A-Za-z0-9]{20,}/);
      expect(doc.body, doc.slug).not.toMatch(/postgres(ql)?:\/\/[^\s:]+:[^@\s]+@/);
    }
  });
});

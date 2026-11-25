import { describe, expect, it } from "vitest";
import { normalize, type SearchEntry, search } from "../lib/search-core";
import { buildSearchIndex } from "../lib/search-index";

const entries: SearchEntry[] = [
  {
    slug: "guides/tools",
    title: "Tools",
    section: "Guides",
    description: "Give the assistant actions.",
    headings: [{ id: "your-first-tool", text: "Your first tool" }],
    text: "A tool is a function. The model asks for it. Nothing about voice here.",
  },
  {
    slug: "guides/voice",
    title: "Voice and languages",
    section: "Guides",
    description: "Listening and speaking.",
    headings: [{ id: "listen", text: "Listen" }],
    text: "Use the microphone. A tool can also be used by voice.",
  },
  {
    slug: "faq",
    title: "Café questions",
    section: "More",
    description: "Answers.",
    headings: [],
    text: "Plain answers to common questions.",
  },
];

describe("search", () => {
  it("ranks a title match above a body match", () => {
    const hits = search(entries, "tool");
    expect(hits[0]?.slug).toBe("guides/tools");
    expect(hits.map((h) => h.slug)).toContain("guides/voice");
  });

  it("returns the matching heading anchor", () => {
    const hit = search(entries, "first tool")[0];
    expect(hit?.anchor).toBe("your-first-tool");
  });

  it("ignores case and diacritics", () => {
    expect(normalize("Café")).toBe("cafe");
    expect(search(entries, "CAFE")[0]?.slug).toBe("faq");
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(search(entries, "")).toEqual([]);
    expect(search(entries, "   ")).toEqual([]);
  });

  it("requires every word to match", () => {
    expect(search(entries, "tool zebra")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(search(entries, "a", 1).length).toBeLessThanOrEqual(1);
  });
});

describe("search index", () => {
  it("covers every page and stays small", async () => {
    const index = await buildSearchIndex();
    expect(index.length).toBeGreaterThanOrEqual(25);
    expect(JSON.stringify(index).length).toBeLessThan(300_000);
    const hit = search(index, "confirm")[0];
    expect(hit).toBeDefined();
  });
});

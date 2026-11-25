import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
import { flatNav } from "../content/nav";
import { type Rendered, renderMarkdown } from "./markdown";

export interface DocMeta {
  slug: string;
  title: string;
  description: string;
  body: string;
  file: string;
}
export interface Doc extends DocMeta, Rendered {}

const ROOT = join(/*turbopackIgnore: true*/ process.cwd(), "content");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".md") ? [full] : [];
  });
}

let cache: DocMeta[] | null = null;

/** Every markdown page, read once per process. */
export function getAllDocs(): DocMeta[] {
  if (cache) return cache;
  cache = walk(ROOT).map((file) => {
    const slug = relative(ROOT, file).split(sep).join("/").replace(/\.md$/, "");
    const parsed = matter(readFileSync(file, "utf8"));
    const data = parsed.data as { title?: string; description?: string };
    return {
      slug,
      title: String(data.title ?? slug),
      description: String(data.description ?? ""),
      body: parsed.content,
      file: relative(join(ROOT, ".."), file).split(sep).join("/"),
    };
  });
  return cache;
}

const rendered = new Map<string, Promise<Doc>>();

export function getDoc(slug: string): Promise<Doc> | null {
  const meta = getAllDocs().find((doc) => doc.slug === slug);
  if (!meta) return null;
  let promise = rendered.get(slug);
  if (!promise) {
    // The page renders the title itself, so drop the first "# Title" line from the body.
    const body = meta.body.trim().replace(/^#\s.*\n+/, "");
    promise = renderMarkdown(body).then((out) => ({ ...meta, ...out }));
    rendered.set(slug, promise);
  }
  return promise;
}

export function markdownSlugs(): string[] {
  return flatNav.filter((page) => !page.custom).map((page) => page.slug);
}

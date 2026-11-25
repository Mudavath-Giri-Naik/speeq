import { getAllDocs, markdownSlugs } from "../../../../lib/content";

export const dynamicParams = false;

export function generateStaticParams() {
  return markdownSlugs().map((slug) => ({ slug: `${slug}.md`.split("/") }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const wanted = slug.join("/").replace(/\.md$/, "");
  const doc = getAllDocs().find((d) => d.slug === wanted);
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(`# ${doc.title}\n\n${doc.body.trim().replace(/^#\s.*\n+/, "")}\n`, {
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}

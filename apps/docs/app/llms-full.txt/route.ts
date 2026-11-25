import { flatNav } from "../../content/nav";
import { getAllDocs } from "../../lib/content";

export const dynamic = "force-static";

export function GET() {
  const docs = new Map(getAllDocs().map((d) => [d.slug, d]));
  const parts = flatNav.flatMap((page) => {
    const doc = docs.get(page.slug);
    return doc ? [`<!-- ${doc.slug} -->\n${doc.body.trim()}`] : [];
  });
  return new Response(`# speeq documentation\n\n${parts.join("\n\n---\n\n")}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

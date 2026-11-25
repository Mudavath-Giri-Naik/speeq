import { nav } from "../../content/nav";
import { getAllDocs } from "../../lib/content";
import { siteUrl } from "../../lib/site";

export const dynamic = "force-static";

export function GET() {
  const base = siteUrl();
  const docs = new Map(getAllDocs().map((d) => [d.slug, d]));
  const lines = [
    "# speeq",
    "",
    "> speeq is a headless voice and text assistant for web apps. It runs a server handler in your backend, a framework-free browser client and React hooks. You bring the model, the tools, the data and the design. It is pre-1.0 (0.2.x).",
    "",
    "Key facts:",
    "- Install: npm i speeq@next zod (Node 20+, zod 4). Every part is also published as @speeq/* packages.",
    "- No speeq cloud. Conversations stay in your database and go to your model provider.",
    "- Tools that change data need the visitor's approval. Telemetry is anonymous and off until configured.",
    "",
  ];
  for (const section of nav) {
    lines.push(`## ${section.title}`, "");
    for (const page of section.pages) {
      const description = docs.get(page.slug)?.description ?? "";
      lines.push(
        `- [${page.title}](${base}/docs/raw/${page.slug}.md)${description ? `: ${description}` : ""}`,
      );
    }
    lines.push("");
  }
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

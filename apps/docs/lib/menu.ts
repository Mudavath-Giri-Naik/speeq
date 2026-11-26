import { nav } from "../content/nav";
import { getAllDocs } from "./content";

export interface MenuLink {
  href: string;
  title: string;
  description: string;
}
export interface MenuGroup {
  id: string;
  label: string;
  /** The page the group's highlighted card points at. */
  featured: MenuLink & { cta: string };
  columns: Array<{ heading: string; links: MenuLink[] }>;
}

function shorten(text: string, max = 74): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** The dropdown menus of the top bar, built from the real pages so they never go stale. */
export function buildMenu(): MenuGroup[] {
  const docs = new Map(getAllDocs().map((d) => [d.slug, d]));
  const titles = new Map(nav.flatMap((s) => s.pages.map((p) => [p.slug, p.title] as const)));
  const link = (slug: string): MenuLink => ({
    href: `/docs/${slug}`,
    title: titles.get(slug) ?? slug,
    description: shorten(docs.get(slug)?.description ?? ""),
  });
  const list = (slugs: string[]) => slugs.map(link);

  return [
    {
      id: "docs",
      label: "Docs",
      featured: {
        ...link("quickstart"),
        description: "Install it, mount one route and say hello in five minutes.",
        cta: "Start building",
      },
      columns: [
        { heading: "Start here", links: list(["introduction", "install", "ai-setup", "faq"]) },
        {
          heading: "Concepts",
          links: list([
            "concepts/how-it-works",
            "concepts/confirmations",
            "concepts/security",
            "concepts/privacy",
          ]),
        },
      ],
    },
    {
      id: "guides",
      label: "Guides",
      featured: { ...link("guides/nextjs"), title: "Add speeq to Next.js", cta: "Read the guide" },
      columns: [
        {
          heading: "Build",
          links: list([
            "guides/tools",
            "guides/knowledge",
            "guides/routes",
            "guides/voice",
            "guides/models",
          ]),
        },
        {
          heading: "Ship",
          links: list([
            "guides/stores",
            "guides/testing",
            "guides/deployment",
            "guides/audit-viewer",
            "guides/dashboard",
          ]),
        },
      ],
    },
    {
      id: "reference",
      label: "Reference",
      featured: { ...link("reference/client"), cta: "Open the reference" },
      columns: [
        {
          heading: "APIs",
          links: list(["reference/server-config", "reference/react", "reference/protocol"]),
        },
        {
          heading: "Details",
          links: list(["reference/errors", "reference/environment", "reference/telemetry"]),
        },
      ],
    },
  ];
}

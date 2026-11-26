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

  const page = (href: string, title: string, description: string): MenuLink => ({
    href,
    title,
    description,
  });

  return [
    {
      id: "product",
      label: "Product",
      featured: {
        ...page(
          "/#demo",
          "See intent become action",
          "Watch a request go from words to your own interface.",
        ),
        cta: "Watch the demo",
      },
      columns: [
        {
          heading: "The layer",
          links: [
            page(
              "/#architecture",
              "Interaction engine",
              "How a request moves through speeq and your app.",
            ),
            link("guides/voice"),
            link("guides/tools"),
          ],
        },
        {
          heading: "Around it",
          links: [
            link("concepts/how-it-works"),
            page(
              "/#intelligence",
              "Business intelligence",
              "Audit data today, richer insight next.",
            ),
            page(
              "/#security",
              "Security and ownership",
              "Your data, your permissions, your infrastructure.",
            ),
          ],
        },
      ],
    },
    {
      id: "developers",
      label: "Developers",
      featured: {
        ...link("quickstart"),
        description: "Install it, mount one route and say hello in five minutes.",
        cta: "Start building",
      },
      columns: [
        {
          heading: "Build",
          links: [
            link("guides/nextjs"),
            link("guides/models"),
            link("guides/knowledge"),
            link("ai-setup"),
            page("/#roadmap", "Roadmap", "What is available and what is planned."),
          ],
        },
        {
          heading: "Reference",
          links: list([
            "reference/server-config",
            "reference/react",
            "reference/protocol",
            "reference/errors",
            "guides/deployment",
          ]),
        },
      ],
    },
    {
      id: "usecases",
      label: "Use cases",
      featured: {
        ...page(
          "/#use-cases",
          "One layer, many industries",
          "Connect functionality you already approved.",
        ),
        cta: "Explore use cases",
      },
      columns: [
        {
          heading: "Customer facing",
          links: [
            page("/#use-cases", "E-commerce", "Discover products and move through checkout."),
            page("/#use-cases", "Education", "Question banks, courses and admissions."),
            page("/#use-cases", "Healthcare", "Departments, doctors and appointments."),
          ],
        },
        {
          heading: "Operations",
          links: [
            page("/#use-cases", "Financial services", "Authorized account information."),
            page("/#use-cases", "Logistics", "Shipments, tracking and bookings."),
            page("/#use-cases", "SaaS and enterprise", "Reports, dashboards and workflows."),
          ],
        },
      ],
    },
  ];
}

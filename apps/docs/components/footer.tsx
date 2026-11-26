import Link from "next/link";
import { NPM_URL, REPO_URL } from "../lib/site";
import { ThemeToggle } from "./theme-toggle";

type FooterLink = { href: string; label: string; external?: boolean };

const columns: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Product",
    links: [
      { href: "/#architecture", label: "Interaction engine" },
      { href: "/docs/guides/voice", label: "Voice and languages" },
      { href: "/docs/guides/tools", label: "Application actions" },
      { href: "/#intelligence", label: "Intelligence" },
      { href: "/#roadmap", label: "Roadmap" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/introduction", label: "Documentation" },
      { href: "/docs/reference/server-config", label: "API reference" },
      { href: "/docs/concepts/how-it-works", label: "Architecture" },
      { href: "/docs/guides/models", label: "Integrations" },
      { href: "/docs/packages", label: "Packages" },
    ],
  },
  {
    title: "Open source",
    links: [
      { href: REPO_URL, label: "GitHub", external: true },
      { href: "/docs/releases", label: "Releases" },
      { href: `${REPO_URL}/issues`, label: "Issues", external: true },
      { href: `${REPO_URL}/blob/main/CONTRIBUTING.md`, label: "Contributing", external: true },
      { href: `${REPO_URL}/blob/main/LICENSE`, label: "License (MIT)", external: true },
      { href: NPM_URL, label: "npm", external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs/releases", label: "Changelog" },
      { href: "/docs/faq", label: "FAQ" },
      { href: "/docs/security-policy", label: "Security policy" },
      { href: "/docs/concepts/privacy", label: "Privacy and telemetry" },
      { href: "/stats", label: "Adoption" },
      { href: "/llms.txt", label: "llms.txt" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container-x grid gap-12 py-14 sm:py-16 lg:grid-cols-[1.2fr_2.8fr]">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[1.7rem] font-extrabold tracking-[-0.06em] text-fg">
            speeq
          </p>
          <p className="mt-3 max-w-xs text-[0.92rem] leading-relaxed text-soft">
            The intelligent interaction layer for the web.
          </p>
          <p className="mt-4 max-w-xs text-xs leading-relaxed text-muted">
            Open source, MIT licensed, pre-1.0. Your application, your infrastructure, your control.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="mono-label !text-fg">{column.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[0.88rem] text-muted transition-colors hover:text-fg"
                      >
                        {link.label} <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[0.88rem] text-muted transition-colors hover:text-fg"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-wrap items-center justify-between gap-4 py-5 text-xs text-muted">
          <span>
            © {new Date().getFullYear()} speeq contributors. This site uses no cookies or trackers.
          </span>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}

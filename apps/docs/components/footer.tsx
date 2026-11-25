import Link from "next/link";
import { NPM_URL, REPO_URL } from "../lib/site";
import { Logo } from "./icons";

const columns = [
  {
    title: "Learn",
    links: [
      { href: "/docs/introduction", label: "Introduction" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/guides/nextjs", label: "Next.js guide" },
      { href: "/docs/ai-setup", label: "Set up with AI" },
    ],
  },
  {
    title: "Reference",
    links: [
      { href: "/docs/reference/server-config", label: "Server settings" },
      { href: "/docs/reference/protocol", label: "HTTP protocol" },
      { href: "/docs/reference/errors", label: "Error codes" },
      { href: "/docs/packages", label: "Packages" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: "/stats", label: "Adoption" },
      { href: "/docs/releases", label: "Releases" },
      { href: "/docs/faq", label: "FAQ" },
      { href: "/docs/security-policy", label: "Security policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5 font-semibold text-fg">
            <Logo />
            <span className="text-lg">speeq</span>
          </div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            A headless voice and text assistant for web apps. Your data, your model, your design.
          </p>
          <p className="mt-4 text-xs text-muted">
            Pre-1.0 (0.2.x). MIT license. This site uses no cookies or trackers.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h2 className="text-sm font-semibold text-fg">{column.title}</h2>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted transition hover:text-fg">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container-x flex flex-wrap items-center justify-between gap-3 py-5 text-xs text-muted">
          <span>© {new Date().getFullYear()} speeq contributors</span>
          <span className="flex gap-4">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
              GitHub
            </a>
            <a href={NPM_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
              npm
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}

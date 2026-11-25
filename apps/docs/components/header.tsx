import Link from "next/link";
import { REPO_URL } from "../lib/site";
import { formatCount, getGithubStars } from "../lib/stats";
import { GithubIcon, Logo, StarIcon } from "./icons";
import { MobileMenu } from "./mobile-menu";
import { SearchButton } from "./search-palette";
import { ThemeToggle } from "./theme-toggle";

const links = [
  { href: "/docs/introduction", label: "Docs" },
  { href: "/docs/guides/nextjs", label: "Guides" },
  { href: "/docs/reference/server-config", label: "Reference" },
  { href: "/stats", label: "Adoption" },
];

export async function Header() {
  const stars = await getGithubStars();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/75 backdrop-blur-xl">
      <a
        href="#main"
        className="sr-only z-[200] rounded-lg bg-accent px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="container-x flex h-16 items-center gap-3">
        <MobileMenu />
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-fg">
          <Logo />
          <span className="text-lg">speeq</span>
        </Link>
        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-1.5 text-sm text-muted transition hover:bg-surface hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchButton />
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden h-10 items-center gap-2 rounded-full border border-line px-3.5 text-sm text-soft transition hover:border-line-strong hover:text-fg md:inline-flex"
            aria-label={`speeq on GitHub${stars === null ? "" : `, ${stars} stars`}`}
          >
            <GithubIcon width={17} height={17} />
            <span>GitHub</span>
            {stars !== null && (
              <span className="inline-flex items-center gap-1 border-l border-line pl-2 text-muted">
                <StarIcon width={14} height={14} />
                {formatCount(stars, true)}
              </span>
            )}
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

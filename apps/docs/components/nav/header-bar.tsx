"use client";
import { LayoutGroup, motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MenuGroup, MenuLink } from "../../lib/menu";
import { REPO_URL } from "../../lib/site";
import { ArrowIcon, GithubIcon, StarIcon } from "../icons";
import { MobileMenu } from "../mobile-menu";
import { SearchButton } from "../search-palette";
import { ThemeToggle } from "../theme-toggle";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerClass,
} from "./navigation-menu";

const PLAIN_LINKS = [
  { id: "docs", href: "/docs/introduction", label: "Documentation" },
  { id: "releases", href: "/docs/releases", label: "Changelog" },
];

function activeId(pathname: string): string | null {
  if (pathname.startsWith("/docs/releases")) return "releases";
  if (pathname.startsWith("/docs")) return "docs";
  if (pathname.startsWith("/stats")) return "developers";
  return null;
}

function Arrow() {
  return (
    <ArrowIcon
      width={14}
      height={14}
      className="shrink-0 -translate-x-1 text-accent opacity-0 transition duration-300 group-hover/link:translate-x-0 group-hover/link:opacity-100"
    />
  );
}

function MenuItemLink({ link, index }: { link: MenuLink; index: number }) {
  return (
    <NavigationMenuLink
      render={<Link href={link.href} />}
      className="nav-item-in group/link block rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2/80 focus-visible:bg-surface-2/80"
      style={{ ["--i" as string]: index }}
    >
      <span className="flex items-center gap-1.5 text-[0.9rem] font-semibold text-fg">
        {link.title}
        <Arrow />
      </span>
      {link.description && (
        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted">
          {link.description}
        </span>
      )}
    </NavigationMenuLink>
  );
}

function Mega({ group }: { group: MenuGroup }) {
  return (
    <div className="grid w-[min(47rem,calc(100vw-2rem))] grid-cols-[1.05fr_1fr_1fr] gap-2">
      <NavigationMenuLink
        render={<Link href={group.featured.href} />}
        className="nav-feature group/link relative flex min-h-48 flex-col justify-end overflow-hidden rounded-2xl p-5"
      >
        <span className="nav-feature-glow" aria-hidden="true" />
        <span className="relative text-[0.7rem] font-bold tracking-[0.14em] text-white/70 uppercase">
          {group.label}
        </span>
        <span className="relative mt-1 font-[family-name:var(--font-display)] text-xl leading-tight font-extrabold tracking-tight text-white">
          {group.featured.title}
        </span>
        <span className="relative mt-1.5 text-xs leading-snug text-white/75">
          {group.featured.description}
        </span>
        <span className="relative mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white">
          {group.featured.cta}
          <ArrowIcon
            width={14}
            height={14}
            className="transition-transform duration-300 group-hover/link:translate-x-1"
          />
        </span>
      </NavigationMenuLink>
      {group.columns.map((column, c) => (
        <div key={column.heading} className="min-w-0">
          <p className="px-3 pt-1 pb-1.5 text-[0.68rem] font-bold tracking-[0.14em] text-muted uppercase">
            {column.heading}
          </p>
          <ul className="grid gap-0.5">
            {column.links.map((link, i) => (
              <li key={link.href}>
                <MenuItemLink link={link} index={c * 4 + i} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function HeaderBar({ groups, stars }: { groups: MenuGroup[]; stars: string | null }) {
  const pathname = usePathname();
  const active = activeId(pathname);
  const [hovered, setHovered] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12));

  const pill = (id: string) =>
    hovered === id ? (
      <motion.span
        layoutId="nav-pill"
        className="absolute inset-0 rounded-full bg-surface-2/90 ring-1 ring-line"
        transition={{ type: "spring", stiffness: 520, damping: 38 }}
      />
    ) : null;
  const dot = (id: string) =>
    active === id ? (
      <motion.span
        layoutId="nav-dot"
        className="absolute -bottom-0.5 left-1/2 z-10 size-1 -translate-x-1/2 rounded-full bg-accent shadow-[0_0_10px_2px_var(--accent)]"
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
      />
    ) : null;

  return (
    <header className="nav-slide-in pointer-events-none sticky top-0 z-50 h-16 pt-2">
      <a
        href="#main"
        className="pointer-events-auto sr-only z-[200] rounded-lg bg-accent px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="container-x">
        <div
          className={`site-nav pointer-events-auto relative flex h-[3.4rem] items-center gap-2 rounded-full border pr-2 pl-3 backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-500 lg:pl-6 ${
            scrolled
              ? "border-line-strong bg-bg/92 shadow-[0_22px_60px_-24px_rgba(0,0,0,0.8)]"
              : "border-line bg-bg/45"
          }`}
        >
          <span
            className="pointer-events-none absolute inset-x-12 -bottom-px h-px bg-gradient-to-r from-transparent via-accent to-transparent transition-opacity duration-500"
            style={{ opacity: scrolled ? 0.85 : 0.35 }}
            aria-hidden="true"
          />

          <Link
            href="/"
            aria-label="speeq home"
            className="wordmark mr-1 font-[family-name:var(--font-display)] text-[1.45rem] leading-none font-extrabold tracking-[-0.06em] text-fg lg:mr-3"
          >
            speeq
          </Link>

          <nav aria-label="Main" className="hidden lg:block">
            <LayoutGroup>
              <NavigationMenu>
                <NavigationMenuList onMouseLeave={() => setHovered(null)}>
                  {groups.map((group) => (
                    <NavigationMenuItem
                      key={group.id}
                      value={group.id}
                      onMouseEnter={() => setHovered(group.id)}
                      onFocus={() => setHovered(group.id)}
                    >
                      {pill(group.id)}
                      <NavigationMenuTrigger>{group.label}</NavigationMenuTrigger>
                      {dot(group.id)}
                      <NavigationMenuContent>
                        <Mega group={group} />
                      </NavigationMenuContent>
                    </NavigationMenuItem>
                  ))}
                  {PLAIN_LINKS.map((item) => (
                    <NavigationMenuItem
                      key={item.id}
                      onMouseEnter={() => setHovered(item.id)}
                      onFocus={() => setHovered(item.id)}
                    >
                      {pill(item.id)}
                      <NavigationMenuLink
                        render={<Link href={item.href} />}
                        className={navigationMenuTriggerClass}
                      >
                        {item.label}
                      </NavigationMenuLink>
                      {dot(item.id)}
                    </NavigationMenuItem>
                  ))}
                </NavigationMenuList>
              </NavigationMenu>
            </LayoutGroup>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <SearchButton />
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="hidden h-10 items-center gap-2 rounded-full border border-line px-3.5 text-sm text-soft transition hover:border-line-strong hover:text-fg xl:inline-flex"
              aria-label={`speeq on GitHub${stars === null ? "" : `, ${stars} stars`}`}
            >
              <GithubIcon width={17} height={17} />
              {stars !== null && (
                <span className="inline-flex items-center gap-1 text-muted">
                  <StarIcon width={14} height={14} />
                  {stars}
                </span>
              )}
            </a>
            <ThemeToggle />
            <Button
              asChild
              className="hidden h-10 rounded-full px-4 whitespace-nowrap shadow-[0_8px_24px_-10px_var(--glow)] sm:inline-flex"
            >
              <Link href="/docs/quickstart">
                Get started
                <ArrowIcon width={15} height={15} />
              </Link>
            </Button>
            <MobileMenu groups={groups} />
          </div>
        </div>
      </div>
    </header>
  );
}

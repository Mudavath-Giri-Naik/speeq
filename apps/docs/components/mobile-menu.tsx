"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { MenuGroup } from "../lib/menu";
import { REPO_URL } from "../lib/site";
import { ArrowIcon, GithubIcon, MenuIcon } from "./icons";
import { NavTree } from "./nav-tree";
import { ThemeToggle } from "./theme-toggle";

/**
 * The phone and tablet menu, built on the shadcn Sheet. Every destination of the desktop menu is
 * here, grouped the same way, with the full documentation tree one tap away.
 */
export function MobileMenu({ groups }: { groups: MenuGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the sheet whenever the route changes
  useEffect(() => setOpen(false), [pathname]);
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-soft transition hover:text-fg lg:hidden"
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(23rem,92vw)] gap-0 border-line bg-elev p-0 text-fg sm:max-w-none"
      >
        <SheetHeader className="border-b border-line p-4 pr-12">
          <SheetTitle className="font-[family-name:var(--font-display)] text-[1.35rem] font-extrabold tracking-[-0.06em] text-fg">
            speeq
          </SheetTitle>
          <SheetDescription className="text-xs text-muted">
            The intelligent interaction layer for the web.
          </SheetDescription>
        </SheetHeader>

        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-3">
          <Accordion type="single" collapsible defaultValue={groups[0]?.id}>
            {groups.map((group) => (
              <AccordionItem key={group.id} value={group.id} className="border-line">
                <AccordionTrigger className="py-3.5 text-[0.98rem] font-semibold text-fg hover:no-underline">
                  {group.label}
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <Link
                    href={group.featured.href}
                    onClick={close}
                    className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2.5 text-sm font-medium text-fg"
                  >
                    {group.featured.title}
                    <ArrowIcon width={15} height={15} className="shrink-0 text-accent" />
                  </Link>
                  {group.columns.map((column) => (
                    <div key={column.heading} className="mb-2">
                      <p className="mono-label px-3 pt-1 pb-1 !text-[0.62rem]">{column.heading}</p>
                      <ul>
                        {column.links.map((link) => (
                          <li key={`${column.heading}-${link.title}`}>
                            <Link
                              href={link.href}
                              onClick={close}
                              className="block rounded-lg px-3 py-2 text-[0.9rem] text-soft transition-colors hover:bg-surface hover:text-fg"
                            >
                              {link.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
            <AccordionItem value="docs" className="border-line">
              <AccordionTrigger className="py-3.5 text-[0.98rem] font-semibold text-fg hover:no-underline">
                Documentation
              </AccordionTrigger>
              <AccordionContent className="pb-2">
                <NavTree onNavigate={close} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <ul className="mt-2 space-y-0.5 text-[0.95rem]">
            {[
              ["/docs/releases", "Changelog"],
              ["/stats", "Adoption"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href as string}
                  onClick={close}
                  className="block rounded-lg px-3 py-2.5 font-medium text-fg hover:bg-surface"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button asChild className="h-10 flex-1">
            <Link href="/docs/quickstart" onClick={close}>
              Get started
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon" className="size-10">
            <a href={REPO_URL} target="_blank" rel="noreferrer" aria-label="speeq on GitHub">
              <GithubIcon width={17} height={17} />
            </a>
          </Button>
          <ThemeToggle />
        </div>
      </SheetContent>
    </Sheet>
  );
}

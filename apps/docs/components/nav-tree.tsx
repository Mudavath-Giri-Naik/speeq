"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { nav } from "../content/nav";

/** The documentation tree. Used by the desktop sidebar and the mobile drawer. */
export function NavTree({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation">
      {nav.map((section) => (
        <div key={section.title} className="mb-6">
          <h2 className="mb-2 px-3 text-xs font-semibold tracking-wider text-muted uppercase">
            {section.title}
          </h2>
          <ul className="space-y-0.5">
            {section.pages.map((page) => {
              const href = `/docs/${page.slug}`;
              const active = pathname === href;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-lg px-3 py-1.5 text-[0.92rem] transition-colors ${
                      active
                        ? "bg-accent-soft font-medium text-fg"
                        : "text-muted hover:bg-surface hover:text-fg"
                    }`}
                  >
                    {page.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

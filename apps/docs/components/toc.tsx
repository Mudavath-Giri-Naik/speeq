"use client";
import { useEffect, useState } from "react";
import type { Heading } from "../lib/markdown";

export function Toc({ headings, variant }: { headings: Heading[]; variant: "inline" | "side" }) {
  const [active, setActive] = useState<string>(headings[0]?.id ?? "");

  useEffect(() => {
    if (headings.length === 0 || variant !== "side") return;
    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const top = visible[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: [0, 1] },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [headings, variant]);

  if (headings.length === 0) return null;

  const list = (
    <ul className="space-y-1.5 border-l border-line">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            aria-current={active === h.id ? "location" : undefined}
            className={`-ml-px block border-l py-0.5 text-[0.85rem] leading-snug transition-colors ${
              h.depth === 3 ? "pl-7" : "pl-4"
            } ${
              active === h.id
                ? "border-accent font-medium text-fg"
                : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );

  if (variant === "inline") {
    return (
      <details className="mb-6 rounded-xl border border-line bg-surface/50 xl:hidden">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-fg">
          On this page
        </summary>
        <div className="px-4 pb-4">{list}</div>
      </details>
    );
  }
  return (
    <aside className="sticky top-24 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto xl:block">
      <p className="mb-3 text-xs font-semibold tracking-wider text-muted uppercase">On this page</p>
      {list}
    </aside>
  );
}

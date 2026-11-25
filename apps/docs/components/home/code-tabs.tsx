"use client";
import { useState } from "react";

export interface CodeTab {
  id: string;
  label: string;
  file: string;
  /** HTML already highlighted on the server. */
  html: string;
}

export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;
  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-1 overflow-x-auto border-b border-line bg-surface/60 px-2 py-2"
        role="tablist"
        aria-label="Code examples"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === current.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={`min-h-9 shrink-0 rounded-lg px-3.5 text-sm transition ${
              tab.id === current.id
                ? "bg-accent-soft font-medium text-fg"
                : "text-muted hover:text-fg"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto hidden shrink-0 pr-2 font-mono text-xs text-muted sm:block">
          {current.file}
        </span>
      </div>
      <div
        role="tabpanel"
        id={`panel-${current.id}`}
        aria-labelledby={`tab-${current.id}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable code panel must be reachable by keyboard
        tabIndex={0}
        className="shiki-static scroll-thin overflow-x-auto bg-[var(--code-bg)] p-5 font-mono text-[0.82rem] leading-[1.75] [&_pre]:m-0 [&_pre]:!bg-transparent"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML comes from our own code samples highlighted at build time
        dangerouslySetInnerHTML={{ __html: current.html }}
      />
    </div>
  );
}

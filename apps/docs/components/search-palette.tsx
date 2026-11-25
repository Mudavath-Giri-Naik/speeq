// biome-ignore-all lint/a11y: custom combobox and listbox following the WAI-ARIA combobox pattern
"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type SearchEntry, type SearchHit, search } from "../lib/search-core";
import { SearchIcon } from "./icons";

let indexPromise: Promise<SearchEntry[]> | null = null;
function loadIndex(): Promise<SearchEntry[]> {
  if (!indexPromise) {
    indexPromise = fetch("/search-index.json")
      .then((r) => (r.ok ? (r.json() as Promise<SearchEntry[]>) : []))
      .catch(() => []);
  }
  return indexPromise;
}

export function SearchButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (
        (event.key === "k" && (event.ctrlKey || event.metaKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-soft hover:border-line-strong hover:text-fg sm:hidden"
        aria-label="Search the docs"
        aria-haspopup="dialog"
      >
        <SearchIcon width={17} height={17} />
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-10 min-w-52 items-center gap-2 rounded-full border border-line bg-surface/60 pr-2 pl-3.5 text-sm text-muted transition hover:border-line-strong hover:text-fg sm:inline-flex"
        aria-label="Search the docs"
        aria-haspopup="dialog"
      >
        <SearchIcon width={17} height={17} />
        <span className="flex-1 text-left">Search docs</span>
        <kbd className="rounded-md border border-line bg-elev px-1.5 py-0.5 font-mono text-[11px]">
          Ctrl K
        </kbd>
      </button>
      {open && createPortal(<Palette onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchEntry[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    let alive = true;
    void loadIndex().then((entries) => alive && setIndex(entries));
    input.current?.focus();
    const previous = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    return () => {
      alive = false;
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, []);

  const hits: SearchHit[] = search(index, query);
  const go = useCallback(
    (hit: SearchHit) => {
      onClose();
      router.push(`/docs/${hit.slug}${hit.anchor ? `#${hit.anchor}` : ""}`);
    },
    [onClose, router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) {
        event.preventDefault();
        go(hit);
      }
    } else if (event.key === "Tab") {
      // Keep focus inside the dialog.
      event.preventDefault();
      input.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-3 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Search the docs"
        onKeyDown={onKeyDown}
        className="pop w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-elev shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <SearchIcon className="shrink-0 text-muted" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
            placeholder="Search the docs…"
            className="h-14 w-full bg-transparent text-base text-fg outline-none focus-visible:outline-none placeholder:text-muted"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted sm:block">
            Esc
          </kbd>
        </div>
        <ul id={listId} role="listbox" className="scroll-thin max-h-[55vh] overflow-y-auto p-2">
          {query.trim() === "" && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              Type to search. Try “tools”, “voice” or “privacy”.
            </li>
          )}
          {query.trim() !== "" && hits.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">No results for “{query}”.</li>
          )}
          {hits.map((hit, i) => (
            <li
              key={`${hit.slug}-${hit.anchor ?? ""}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(hit)}
              className={`cursor-pointer rounded-xl px-3 py-2.5 ${i === active ? "bg-accent-soft" : ""}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-medium text-fg">{hit.title}</span>
                {hit.heading && (
                  <span className="truncate text-sm text-muted">› {hit.heading}</span>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted">{hit.section}</span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-sm text-muted">{hit.snippet}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, MenuIcon } from "./icons";
import { NavTree } from "./nav-tree";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const first = panel.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("a, button");
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem?.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      button.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-soft hover:text-fg lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <MenuIcon />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[90] lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              tabIndex={-1}
            />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="pop scroll-thin absolute inset-y-0 left-0 flex w-[min(21rem,88vw)] flex-col overflow-y-auto border-r border-line bg-elev p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-semibold text-fg">Menu</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-soft"
                  aria-label="Close menu"
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="mb-5 grid grid-cols-2 gap-2">
                <Link
                  href="/stats"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-line px-3 py-2 text-center text-sm text-fg"
                >
                  Adoption
                </Link>
                <Link
                  href="/docs/quickstart"
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-accent-soft px-3 py-2 text-center text-sm font-medium text-fg"
                >
                  Quickstart
                </Link>
              </div>
              <NavTree onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

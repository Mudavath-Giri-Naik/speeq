"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const PM_KEY = "speeq-pm";

function readPm(): string {
  try {
    return localStorage.getItem(PM_KEY) || "npm";
  } catch {
    return "npm";
  }
}
function showPm(name: string) {
  for (const tabs of document.querySelectorAll<HTMLElement>(".pm-tabs")) {
    for (const tab of tabs.querySelectorAll<HTMLElement>("[data-pm-tab]")) {
      tab.setAttribute("aria-selected", String(tab.dataset.pmTab === name));
    }
    for (const pane of tabs.querySelectorAll<HTMLElement>(".pm-pane")) {
      pane.hidden = pane.dataset.pm !== name;
    }
  }
}

/**
 * One global listener for the small bits of behavior that markdown content needs:
 * copy buttons, package manager tabs, scroll reveals and the pointer glow on cards.
 */
export function Enhancer() {
  const pathname = usePathname();

  useEffect(() => {
    showPm(readPm());
    const onClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const copy = target?.closest<HTMLElement>("[data-copy]");
      if (copy) {
        const block = copy.closest(".code-block");
        const pre = block?.classList.contains("pm-tabs")
          ? block.querySelector(".pm-pane:not([hidden]) pre")
          : block?.querySelector("pre");
        const text = pre?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(text.replace(/\n$/, ""));
          const old = copy.textContent;
          copy.textContent = "Copied";
          copy.setAttribute("aria-live", "polite");
          window.setTimeout(() => {
            copy.textContent = old;
          }, 1600);
        } catch {
          copy.textContent = "Press Ctrl+C";
        }
        return;
      }
      const tab = target?.closest<HTMLElement>("[data-pm-tab]");
      if (tab?.dataset.pmTab) {
        try {
          localStorage.setItem(PM_KEY, tab.dataset.pmTab);
        } catch {
          // storage may be blocked
        }
        showPm(tab.dataset.pmTab);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Re-run for each page: reveal-on-scroll and tab state for newly rendered content.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
  useEffect(() => {
    showPm(readPm());
    const items = document.querySelectorAll<HTMLElement>(".reveal:not(.in)");
    if (typeof IntersectionObserver === "undefined") {
      for (const item of items) item.classList.add("in");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const item of items) observer.observe(item);
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;
    const onMove = (event: PointerEvent) => {
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>(".glow-card");
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);

  return null;
}

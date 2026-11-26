"use client";
import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Smooth, inertial scrolling for the whole site.
 * It is skipped for visitors who ask for less motion, and scrollable areas inside the page
 * (code blocks, the assistant chat, menus) keep their normal scrolling.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 0.95,
      smoothWheel: true,
      autoRaf: true,
      allowNestedScroll: true,
      anchors: { offset: -88 },
    });
    document.documentElement.classList.add("lenis-on");
    return () => {
      document.documentElement.classList.remove("lenis-on");
      lenis.destroy();
    };
  }, []);

  return null;
}

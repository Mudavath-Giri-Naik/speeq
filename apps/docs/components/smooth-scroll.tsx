"use client";
import Lenis from "lenis";
import { motion, useScroll, useSpring } from "motion/react";
import { useEffect } from "react";

/**
 * Smooth, inertial scrolling for the whole site, plus a thin progress bar at the top.
 * It is skipped for visitors who ask for less motion, and scrollable areas inside the page
 * (code blocks, the assistant chat, menus) keep their normal scrolling.
 */
export function SmoothScroll() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.4 });

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 0.95,
      smoothWheel: true,
      allowNestedScroll: true,
      anchors: { offset: -88 },
    });
    document.documentElement.classList.add("lenis-on");
    return () => {
      document.documentElement.classList.remove("lenis-on");
      lenis.destroy();
    };
  }, []);

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX: progress }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[120] h-[2px] origin-left bg-gradient-to-r from-accent via-accent-2 to-[#f472b6]"
    />
  );
}

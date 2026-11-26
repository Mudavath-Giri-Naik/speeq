"use client";
import { useInView } from "motion/react";
import { type ReactNode, useRef } from "react";

/** Wraps looping decoration so its animation pauses while it is off screen. */
export function Live({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const live = useInView(ref, { margin: "100px" });
  return (
    <div ref={ref} data-live={live} className={className}>
      {children}
    </div>
  );
}

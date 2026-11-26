"use client";
import { motion, useReducedMotion } from "motion/react";
import { type RefObject, useEffect, useId, useState } from "react";

export interface AnimatedBeamProps {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  duration?: number;
  delay?: number;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}

/**
 * A line between two elements with a bright pulse that travels along it.
 * Port of the Magic UI "animated beam", on motion and tuned for this site.
 */
export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 4.5,
  delay = 0,
  pathColor = "currentColor",
  pathWidth = 2,
  pathOpacity = 0.18,
  gradientStartColor = "#ff5a1f",
  gradientStopColor = "#ffb02e",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: AnimatedBeamProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const [path, setPath] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const from = fromRef.current;
      const to = toRef.current;
      if (!from || !to) return;
      const c = container.getBoundingClientRect();
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x1 = a.left - c.left + a.width / 2 + startXOffset;
      const y1 = a.top - c.top + a.height / 2 + startYOffset;
      const x2 = b.left - c.left + b.width / 2 + endXOffset;
      const y2 = b.top - c.top + b.height / 2 + endYOffset;
      setSize({ width: c.width, height: c.height });
      setPath(`M ${x1},${y1} Q ${(x1 + x2) / 2},${(y1 + y2) / 2 - curvature} ${x2},${y2}`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [containerRef, fromRef, toRef, curvature, startXOffset, startYOffset, endXOffset, endYOffset]);

  const gradient = `beam-${id.replace(/:/g, "")}`;
  const from = reverse ? { x1: "90%", x2: "100%" } : { x1: "10%", x2: "0%" };
  const to = reverse
    ? { x1: ["90%", "-10%"], x2: ["100%", "0%"] }
    : { x1: ["10%", "110%"], x2: ["0%", "100%"] };

  return (
    <svg
      fill="none"
      width={size.width}
      height={size.height}
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute top-0 left-0 transform-gpu stroke-2"
      viewBox={`0 0 ${size.width} ${size.height}`}
      aria-hidden="true"
    >
      <path
        d={path}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />
      <path d={path} strokeWidth={pathWidth} stroke={`url(#${gradient})`} strokeLinecap="round" />
      <defs>
        <motion.linearGradient
          id={gradient}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
          animate={
            reduce
              ? { x1: from.x1, x2: from.x2 }
              : { x1: to.x1, x2: to.x2, y1: ["0%", "0%"], y2: ["0%", "0%"] }
          }
          transition={{
            delay,
            duration,
            ease: [0.16, 1, 0.3, 1],
            repeat: Infinity,
            repeatDelay: 0,
          }}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} />
          <stop offset="32.5%" stopColor={gradientStopColor} />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  );
}

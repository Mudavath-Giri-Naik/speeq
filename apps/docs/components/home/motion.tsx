"use client";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type ElementType, Fragment, type ReactNode, useEffect, useRef } from "react";

/** Fades and lifts its content into view the first time it scrolls on screen. */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "li" | "section" | "p" | "span";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as] as ElementType;
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-12% 0px -8% 0px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}

/** A heading whose words rise in one after another. Words in `accent` get the brand gradient. */
export function SplitHeading({
  text,
  accent = [],
  className,
  as = "h1",
  delay = 0,
}: {
  text: string;
  accent?: string[];
  className?: string;
  as?: "h1" | "h2";
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as] as ElementType;
  // A "|" marks a line break that only applies on wider screens.
  const parts = text.split("|").map((part) => part.trim());
  const words = parts.flatMap((part, p) => [
    ...part.split(" "),
    ...(p < parts.length - 1 ? ["|"] : []),
  ]);
  return (
    <Tag className={className} aria-label={parts.join(" ")}>
      {words.map((word, i) =>
        word === "|" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the words never reorder
          <br key={i} className="hidden sm:block" aria-hidden="true" />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the words never reorder
          <Fragment key={i}>
            <span
              aria-hidden="true"
              className="inline-block overflow-hidden pb-[0.12em] align-bottom"
            >
              <motion.span
                className={`inline-block ${accent.includes(word) ? "gradient-text" : ""}`}
                initial={
                  reduce ? false : { y: "110%", opacity: 0, rotate: 4, filter: "blur(10px)" }
                }
                animate={{ y: 0, opacity: 1, rotate: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.9, delay: delay + i * 0.09, ease: [0.22, 1, 0.36, 1] }}
              >
                {word}
              </motion.span>
            </span>
            {i < words.length - 1 ? " " : null}
          </Fragment>
        ),
      )}
    </Tag>
  );
}

/** A number that counts up to its value when it scrolls into view. */
export function CountUp({ value, className }: { value: number | null; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const count = useMotionValue(0);
  const text = useTransform(count, (n) => Math.round(n).toLocaleString("en-US"));

  useEffect(() => {
    if (!inView || value === null) return;
    if (reduce) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration: 1.6, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [inView, value, reduce, count]);

  if (value === null) return <span className={className}>–</span>;
  return (
    <span ref={ref} className={className}>
      <motion.span>{text}</motion.span>
    </span>
  );
}

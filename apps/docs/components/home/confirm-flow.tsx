"use client";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../icons";

const STEPS = [
  ["Visitor asks", "“Cancel my last order.”"],
  ["Held as pending", "cancel_order is a write tool, so nothing runs yet."],
  ["Visitor approves", "A clear Yes. Each Yes works once."],
  ["Tool runs and is audited", "Your handler checks permissions again, then the result is logged."],
] as const;

/** The confirmation path for a change to data, stepping through its four stages. */
export function ConfirmFlow() {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -15% 0px" });
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const t = window.setInterval(() => setActive((n) => (n + 1) % (STEPS.length + 1)), 1700);
    return () => window.clearInterval(t);
  }, [inView, reduce]);

  const shown = reduce ? STEPS.length : active;
  return (
    <ol ref={ref} className="relative space-y-3" aria-label="How a change to data is confirmed">
      <span
        className="absolute top-3 bottom-3 left-[0.8rem] w-px bg-line-strong"
        aria-hidden="true"
      />
      {STEPS.map(([title, text], i) => {
        const done = i < shown;
        const current = i === shown - 1;
        return (
          <li key={title} className="relative flex gap-4">
            <span
              className={cn(
                "relative z-10 grid size-[1.65rem] shrink-0 place-items-center rounded-full border text-[0.66rem] transition-colors duration-500",
                done
                  ? "border-accent bg-accent text-white"
                  : "border-line-strong bg-elev text-muted",
              )}
            >
              {done && !current ? <CheckIcon width={12} height={12} /> : i + 1}
            </span>
            <div
              className={cn("transition-opacity duration-500", done ? "opacity-100" : "opacity-55")}
            >
              <p className="text-[0.9rem] font-medium text-fg">{title}</p>
              <p className="mt-0.5 text-[0.82rem] leading-snug text-muted">{text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

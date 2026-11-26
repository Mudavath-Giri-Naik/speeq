"use client";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { forwardRef, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../icons";
import { AnimatedBeam } from "./animated-beam";

const SCENES = [
  {
    say: "Show me black T-shirts under ₹500.",
    call: "products.search({ color, maxPrice })",
    rows: ["Black crew tee · ₹399", "Black pocket tee · ₹449", "Black relaxed tee · ₹499"],
  },
  {
    say: "Show all my delayed shipments.",
    call: "shipments.list({ status })",
    rows: ["Shipment 2041 · delayed", "Shipment 2078 · held at customs"],
  },
  {
    say: "నాకు DBMS లో normalization questions చూపించు.",
    call: "questions.search({ subject, topic })",
    rows: [
      "DBMS · Normalization · 2NF",
      "DBMS · Normalization · BCNF",
      "DBMS · Normalization · 3NF",
    ],
  },
] as const;

const Node = forwardRef<
  HTMLDivElement,
  { step: string; label: string; children: ReactNode; className?: string }
>(({ step, label, children, className }, ref) => (
  <div
    ref={ref}
    className={cn(
      "panel relative z-10 flex min-h-[8.5rem] flex-col p-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.5)]",
      className,
    )}
  >
    <p className="mono-label flex items-center gap-2">
      <span className="text-accent">{step}</span>
      {label}
    </p>
    <div className="mt-3 flex-1">{children}</div>
  </div>
));
Node.displayName = "Node";

/**
 * The idea in one picture: a customer's words become a validated call into the app that already
 * exists, and the app shows the result. The examples are illustrative, not live data.
 */
export function HeroFlow() {
  const container = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  const c = useRef<HTMLDivElement>(null);
  const d = useRef<HTMLDivElement>(null);
  const inView = useInView(container, { margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const timer = window.setInterval(() => setI((n) => (n + 1) % SCENES.length), 4200);
    return () => window.clearInterval(timer);
  }, [inView, reduce]);

  const scene = SCENES[i] ?? SCENES[0];
  const beam = { duration: 3.2, curvature: 0, pathOpacity: 0.22 } as const;

  return (
    <figure ref={container} className="relative m-0">
      <div className="relative grid gap-5 lg:grid-cols-4 lg:gap-7">
        <Node ref={a} step="01" label="Customer intent">
          <div className="relative h-[4.6rem]">
            <AnimatePresence mode="wait">
              <motion.p
                key={scene.say}
                initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={reduce ? undefined : { opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={{ duration: 0.35 }}
                lang={scene.say.startsWith("నాకు") ? "te" : "en"}
                className="rounded-lg rounded-tl-sm border border-line bg-surface px-3 py-2 text-[0.88rem] leading-snug text-fg"
              >
                “{scene.say}”
              </motion.p>
            </AnimatePresence>
          </div>
          <p className="mt-2 text-xs text-muted">Voice or text, in the visitor’s language.</p>
        </Node>

        <Node ref={b} step="02" label="speeq" className="border-accent/40">
          <ul className="space-y-1.5 font-mono text-[0.76rem] text-soft">
            {[
              "resolve intent",
              "pick approved capability",
              "validate arguments",
              "check permissions",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckIcon width={13} height={13} className="shrink-0 text-ok" />
                {t}
              </li>
            ))}
          </ul>
        </Node>

        <Node ref={c} step="03" label="Your application">
          <AnimatePresence mode="wait">
            <motion.p
              key={scene.call}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduce ? undefined : { opacity: 0 }}
              className="break-words rounded-md border border-line bg-surface px-2.5 py-2 font-mono text-[0.76rem] text-fg"
            >
              {scene.call}
            </motion.p>
          </AnimatePresence>
          <p className="mt-2 text-xs text-muted">Your code, your auth, your database.</p>
        </Node>

        <Node ref={d} step="04" label="Completed action">
          <AnimatePresence mode="wait">
            <motion.ul
              key={scene.call}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              className="space-y-1.5"
            >
              {scene.rows.map((row) => (
                <li
                  key={row}
                  className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[0.76rem] text-fg"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-ok" aria-hidden="true" />
                  <span className="truncate">{row}</span>
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>
        </Node>
      </div>

      <AnimatedBeam containerRef={container} fromRef={a} toRef={b} {...beam} />
      <AnimatedBeam containerRef={container} fromRef={b} toRef={c} delay={0.5} {...beam} />
      <AnimatedBeam containerRef={container} fromRef={c} toRef={d} delay={1} {...beam} />

      <figcaption className="mono-label mt-5 text-center normal-case tracking-normal">
        Illustrative flow. Your app keeps its logic; speeq connects the request to it.
      </figcaption>
    </figure>
  );
}

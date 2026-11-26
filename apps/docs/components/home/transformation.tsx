"use client";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { CheckIcon } from "../icons";
import { Em, Section, SectionHead } from "./kit";

const STEPS = [
  "Open the website",
  "Find the category",
  "Go to clothing",
  "Select T-shirts",
  "Set the budget",
  "Choose a color",
  "Browse the results",
];

/** Before and after: the long way through the interface, and the one-sentence way. */
export function Transformation() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  const reduce = useReducedMotion();
  const show = inView || reduce;

  return (
    <Section id="transformation">
      <SectionHead
        id="transformation"
        eyebrow="The problem"
        title={
          <>
            Websites are powerful.
            <br />
            Using them shouldn’t be <Em>complicated.</Em>
          </>
        }
        lede="Modern applications hold a lot of capability, but customers still have to learn how to reach it. They navigate menus, set filters, fill forms and repeat themselves. speeq adds a more natural way in. It complements your interface; it does not replace it."
      />
      <div ref={ref} className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <div className="panel p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <p className="mono-label">Traditional interface</p>
            <p className="mono-label !text-soft">7 steps</p>
          </div>
          <ol className="mt-5 space-y-2.5">
            {STEPS.map((s, i) => (
              <motion.li
                key={s}
                initial={reduce ? false : { opacity: 0, x: -10 }}
                animate={show ? { opacity: 1, x: 0 } : undefined}
                transition={{ delay: i * 0.12, duration: 0.35 }}
                className="flex items-center gap-3 text-[0.92rem] text-soft"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-surface font-mono text-[0.68rem] text-muted">
                  {i + 1}
                </span>
                {s}
              </motion.li>
            ))}
          </ol>
          <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
            The user adapts to the application.
          </p>
        </div>

        <div className="panel relative overflow-hidden border-accent/40 p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <p className="mono-label !text-accent">With speeq</p>
            <p className="mono-label !text-soft">1 sentence</p>
          </div>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={show ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="h-display mt-5 text-[clamp(1.4rem,3.6vw,2rem)] text-fg"
          >
            “Show me black T-shirts under ₹500.”
          </motion.p>
          <motion.ul
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={show ? { opacity: 1, y: 0 } : undefined}
            transition={{ delay: 1.4, duration: 0.5 }}
            className="mt-6 space-y-2"
          >
            {["Black crew tee · ₹399", "Black pocket tee · ₹449", "Black relaxed tee · ₹499"].map(
              (r) => (
                <li
                  key={r}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-[0.86rem] text-fg"
                >
                  <CheckIcon width={14} height={14} className="text-ok" />
                  {r}
                </li>
              ),
            )}
          </motion.ul>
          <p className="mt-6 border-t border-line pt-4 text-sm text-muted">
            The application responds to the user’s intent.
          </p>
        </div>
      </div>
    </Section>
  );
}

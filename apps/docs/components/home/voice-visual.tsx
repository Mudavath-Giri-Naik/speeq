"use client";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LINES = [
  { code: "English", lang: "en", text: "Open the pricing page." },
  { code: "తెలుగు", lang: "te", text: "ధరల పేజీని తెరవండి." },
  { code: "हिन्दी", lang: "hi", text: "प्राइसिंग पेज खोलिए।" },
] as const;

const BARS = 36;

/** An audio waveform and a live-transcript line that switches language. Illustrative. */
export function VoiceVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "100px" });
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!inView || reduce) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % LINES.length), 3000);
    return () => window.clearInterval(t);
  }, [inView, reduce]);

  const line = LINES[i] ?? LINES[0];
  return (
    <div ref={ref} data-live={inView} className="flex h-full flex-col justify-between gap-5">
      <div className="flex h-16 items-center justify-center gap-[3px]" aria-hidden="true">
        {Array.from({ length: BARS }, (_, n) => {
          const h = 28 + Math.abs(Math.sin(n * 0.7)) * 72;
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: the bars are fixed decoration and never reorder
              key={n}
              className="w-[3px] origin-center rounded-full bg-accent/80"
              style={{
                height: `${h}%`,
                animation: reduce
                  ? undefined
                  : `bar-wave ${0.9 + (n % 5) * 0.14}s ease-in-out ${(n % 9) * -0.12}s infinite`,
              }}
            />
          );
        })}
      </div>
      <div>
        <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Example language">
          {LINES.map((l, n) => (
            <button
              key={l.code}
              type="button"
              role="tab"
              aria-selected={n === i}
              onClick={() => setI(n)}
              lang={l.lang}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[0.74rem] transition-colors focus-visible:ring-2 focus-visible:ring-accent",
                n === i
                  ? "border-accent/60 bg-accent-soft text-fg"
                  : "border-line text-muted hover:text-fg",
              )}
            >
              {l.code}
            </button>
          ))}
        </div>
        <div className="min-h-[3rem] rounded-lg border border-line bg-surface px-3.5 py-3">
          <AnimatePresence mode="wait">
            <motion.p
              key={line.lang}
              lang={line.lang}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-[0.92rem] text-fg"
            >
              {line.text}
              {!reduce && (
                <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-accent" />
              )}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

"use client";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type AppView, INDUSTRIES } from "@/lib/home-demo";
import { cn } from "@/lib/utils";
import { CheckIcon, MicIcon } from "../icons";
import { AnimTabs, AnimTabsList, AnimTabsTrigger } from "./anim-tabs";
import { openAssistant } from "./ask";
import { Frame, Status } from "./kit";

/** One request takes this many steps: ask, seven trace lines, app update, reply. */
const LAST_STEP = 9;
const APPLY_AT = 7;

function Replay({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="gap-1.5 text-muted"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
      </svg>
      Replay
    </Button>
  );
}

function AppPane({ view, prev, applied }: { view: AppView; prev: AppView; applied: boolean }) {
  const reduce = useReducedMotion();
  return (
    <Frame
      title={
        <span className="flex items-center gap-1.5">
          <svg
            viewBox="0 0 24 24"
            width="11"
            height="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          {view.site}
        </span>
      }
      className="h-full"
      bodyClassName="p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.95rem] font-semibold text-fg">{view.heading}</h3>
        <span className="mono-label">Your existing UI</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Filters">
        {view.filters.map((f) => {
          const before = prev.filters.find((p) => p.label === f.label);
          const changed = applied && before?.value !== f.value;
          return (
            <li
              key={f.label}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.72rem] transition-colors duration-500",
                changed
                  ? "border-accent/60 bg-accent-soft text-fg"
                  : "border-line bg-surface text-muted",
              )}
            >
              <span>{f.label}</span>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.b
                  key={f.value}
                  initial={reduce ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -5 }}
                  transition={{ duration: 0.25 }}
                  className="font-semibold text-fg"
                >
                  {f.value}
                </motion.b>
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 space-y-1.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {view.rows.map((row, i) => (
            <motion.li
              key={`${view.heading}-${row.title}-${row.meta}`}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.06 }}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
                row.active ? "border-accent/50 bg-accent-soft" : "border-line bg-elev",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-[0.82rem] font-medium text-fg">
                  {row.title}
                </span>
                <span className="block truncate text-[0.72rem] text-muted">{row.meta}</span>
              </span>
              {row.tag && (
                <span className="shrink-0 rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[0.66rem] text-soft">
                  {row.tag}
                </span>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {view.summary && (
        <motion.div
          key={view.summary.label + view.summary.value}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line-strong bg-surface px-3 py-2.5"
        >
          <span className="text-[0.74rem] text-muted">
            {view.summary.label}
            <b className="ml-2 text-[0.9rem] text-fg">{view.summary.value}</b>
          </span>
          <span className="rounded-md bg-accent px-2.5 py-1.5 text-[0.7rem] font-medium text-white">
            {view.summary.cta}
          </span>
        </motion.div>
      )}
    </Frame>
  );
}

/**
 * The signature demonstration: a request, the steps speeq takes, and the existing app responding.
 * It is a scripted simulation with local data, so it never calls a model.
 */
export function ProductDemo() {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { margin: "0px 0px -15% 0px" });
  const [id, setId] = useState(INDUSTRIES[0]?.id ?? "commerce");
  const [turn, setTurn] = useState(0);
  const [step, setStep] = useState(0);

  const industry = INDUSTRIES.find((x) => x.id === id) ?? INDUSTRIES[0];
  const turns = industry?.turns ?? [];
  const current = turns[turn];
  const last = turns.length - 1;

  const restart = useCallback(() => {
    setTurn(0);
    setStep(reduce ? LAST_STEP : 0);
  }, [reduce]);

  const choose = (next: string) => {
    setId(next);
    setTurn(0);
    setStep(reduce ? LAST_STEP : 0);
  };

  // Show the finished state straight away when motion is reduced.
  useEffect(() => {
    if (reduce) {
      setTurn(last);
      setStep(LAST_STEP);
    }
  }, [reduce, last]);

  // Advance the script one step at a time, only while the demo is on screen.
  useEffect(() => {
    if (reduce || !inView) return;
    if (step < LAST_STEP) {
      const delay = step === 0 ? 450 : step === 1 ? 800 : 430;
      const t = window.setTimeout(() => setStep((s) => s + 1), delay);
      return () => window.clearTimeout(t);
    }
    if (turn < last) {
      const t = window.setTimeout(() => {
        setTurn((n) => n + 1);
        setStep(1);
      }, 2400);
      return () => window.clearTimeout(t);
    }
  }, [reduce, inView, step, turn, last]);

  if (!industry || !current) return null;

  const applied = step >= APPLY_AT;
  const prevView = turn > 0 ? (turns[turn - 1]?.view ?? industry.start) : industry.start;
  const view = applied ? current.view : prevView;
  const traceCount = Math.min(Math.max(step - 1, 0), 7);

  return (
    <div ref={root} className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/50 p-2.5 sm:p-3">
        <AnimTabs value={id} onValueChange={choose}>
          <AnimTabsList aria-label="Industry example">
            {INDUSTRIES.map((x) => (
              <AnimTabsTrigger key={x.id} value={x.id}>
                {x.label}
              </AnimTabsTrigger>
            ))}
          </AnimTabsList>
        </AnimTabs>
        <div className="flex items-center gap-2">
          <Status kind="preview" />
          <Replay onClick={restart} />
        </div>
      </div>

      <div className="grid gap-4 p-3 sm:p-5 lg:grid-cols-[0.9fr_1.2fr_1fr] lg:gap-5">
        {/* 1. The request */}
        <div className="flex min-h-[13rem] flex-col rounded-xl border border-line bg-surface/40 p-4 max-lg:order-1">
          <p className="mono-label mb-3 flex items-center gap-2">
            <MicIcon width={13} height={13} className="text-accent" />
            Customer
          </p>
          <div className="flex flex-1 flex-col gap-2.5" aria-live="off">
            {turns.slice(0, turn + 1).map((t, i) => {
              const showUser = i < turn || step >= 1;
              const showReply = i < turn || step >= LAST_STEP;
              return (
                <div key={t.say} className="flex flex-col gap-2.5">
                  {showUser && (
                    <motion.p
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      lang={t.lang}
                      className="ml-auto max-w-[92%] rounded-xl rounded-br-sm bg-accent px-3 py-2 text-[0.84rem] leading-snug text-white"
                    >
                      {t.say}
                    </motion.p>
                  )}
                  {showReply && (
                    <motion.p
                      initial={reduce ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      lang={t.lang}
                      className="max-w-[92%] rounded-xl rounded-bl-sm border border-line bg-elev px-3 py-2 text-[0.84rem] leading-snug text-fg"
                    >
                      {t.reply}
                    </motion.p>
                  )}
                </div>
              );
            })}
            {step === 0 && turn === 0 && (
              <p className="m-auto text-center text-xs text-muted">The request appears here.</p>
            )}
          </div>
        </div>

        {/* 3. What the existing app shows (second on mobile, after the trace) */}
        <div className="max-lg:order-3 lg:order-2">
          <AppPane view={view} prev={prevView} applied={applied} />
        </div>

        {/* 2. What speeq does */}
        <div className="flex min-h-[13rem] flex-col rounded-xl border border-line bg-surface/40 p-4 max-lg:order-2 lg:order-3">
          <p className="mono-label mb-3 flex items-center justify-between gap-2">
            <span>Execution trace</span>
            <span className="text-[0.62rem] normal-case">
              request {turn + 1} of {turns.length}
            </span>
          </p>
          <ol className="space-y-2 font-mono text-[0.72rem] leading-snug">
            {current.trace.slice(0, traceCount).map(([key, value]) => (
              <li key={key} className="trace-in">
                <span className="flex items-center gap-1.5 text-muted">
                  <CheckIcon width={12} height={12} className="shrink-0 text-ok" />
                  {key}
                </span>
                <span className="block pl-[1.1rem] break-words text-fg">{value}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/50 px-4 py-3">
        <p className="text-xs leading-relaxed text-muted">
          Simulated with scripted data. No model is called and nothing here is real customer data.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => openAssistant()}>
          Try the real assistant
        </Button>
      </div>

      <p className="sr-only">
        Example request: “{current.say}”. speeq picks an approved capability, validates the
        arguments, checks permissions, runs your existing service, updates your interface and
        records the outcome.
      </p>
    </div>
  );
}

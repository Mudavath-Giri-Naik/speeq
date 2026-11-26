"use client";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { forwardRef, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnimatedBeam } from "./animated-beam";
import { Em, Section, SectionHead, Status } from "./kit";

const LAYERS = [
  {
    id: "input",
    step: "01",
    title: "Input",
    sub: "How people ask",
    detail:
      "A visitor speaks or types. The page also reports where they are, such as the current route, so the answer fits the moment.",
    nodes: [
      ["Voice", "Browser speech, or server speech from a provider you configure."],
      ["Text", "Typing always works, and it is the fallback when voice is unavailable."],
      ["App context", "The route and any data your app chooses to share with each request."],
    ],
  },
  {
    id: "speeq",
    step: "02",
    title: "speeq layer",
    sub: "Runs on your server",
    detail:
      "Your server asks your model. When data is needed it picks an approved tool, validates the arguments, checks permissions and asks for a Yes before anything changes.",
    nodes: [
      ["Speech and language", "Recognition, synthesis and language handling for voice."],
      ["Agent runtime", "Runs the conversation with the model you connect."],
      ["Tool execution", "Calls only the tools you defined."],
      ["Validation", "Every tool input is checked against a Zod schema."],
      ["Authorization", "Your own checks decide who may run each tool."],
      ["Confirmations", "Changes to data need a Yes from the visitor, once."],
      ["Streaming", "Replies stream to the page as they are written."],
      ["Audit log", "Messages, tool calls and decisions saved in your database."],
    ],
  },
  {
    id: "app",
    step: "03",
    title: "Your application",
    sub: "Already built",
    detail:
      "The tool calls the service you already wrote. Your existing authentication and rules decide what each person can see and do.",
    nodes: [
      ["Routes", "Pages the assistant can open through your own router."],
      ["UI state", "Your interface updates the way it already does."],
      ["Services and APIs", "The functions and endpoints you have today."],
      ["Business logic", "Stays in your code, not in a prompt."],
      ["Authentication", "Your sessions and permissions, unchanged."],
    ],
  },
  {
    id: "infra",
    step: "04",
    title: "Your infrastructure",
    sub: "Stays where it is",
    detail:
      "Your database, payment provider and external APIs stay behind your application. speeq does not need direct access to them.",
    nodes: [
      ["Database", "Your data stays in your database."],
      ["Payments", "Handled by your existing payment flow."],
      ["External APIs", "Reached through your own services."],
      ["Conversation store", "Memory for development, MongoDB for production."],
    ],
  },
] as const;

const FUTURE = ["Application discovery", "Capability manifests", "Richer business analytics"];

const Layer = forwardRef<
  HTMLDivElement,
  { layer: (typeof LAYERS)[number]; active: boolean; onSelect: () => void }
>(({ layer, active, onSelect }, ref) => (
  <div
    ref={ref}
    className={cn(
      "panel relative z-10 flex flex-col p-4 transition-[border-color,box-shadow] duration-500",
      active && "border-accent/60 shadow-[0_0_0_3px_var(--accent-soft)]",
    )}
  >
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="mb-3 block text-left outline-none focus-visible:text-accent"
    >
      <span className="block">
        <span className="block text-[0.92rem] font-semibold text-fg">
          <span className="mono-label mr-2 !text-accent">{layer.step}</span>
          {layer.title}
        </span>
        <span className="mono-label mt-1 block !text-[0.6rem]">{layer.sub}</span>
      </span>
    </button>
    <ul className="flex flex-wrap gap-1.5">
      {layer.nodes.map(([name, tip]) => (
        <li key={name}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-md border border-line bg-surface px-2 py-1 text-[0.72rem] text-soft outline-none transition-colors hover:border-accent/50 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              >
                {name}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-60 border border-line-strong bg-elev text-xs leading-snug text-fg [&_svg]:hidden">
              {tip}
            </TooltipContent>
          </Tooltip>
        </li>
      ))}
    </ul>
  </div>
));
Layer.displayName = "Layer";

/** How a request moves through speeq and your application. Hover or tap a part to read what it does. */
export function Architecture() {
  const container = useRef<HTMLDivElement>(null);
  const r0 = useRef<HTMLDivElement>(null);
  const r1 = useRef<HTMLDivElement>(null);
  const r2 = useRef<HTMLDivElement>(null);
  const r3 = useRef<HTMLDivElement>(null);
  const refs = [r0, r1, r2, r3];
  const inView = useInView(container, { margin: "0px 0px -15% 0px" });
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!inView || !playing || reduce) return;
    const t = window.setInterval(() => setActive((n) => (n + 1) % LAYERS.length), 3200);
    return () => window.clearInterval(t);
  }, [inView, playing, reduce]);

  const layer = LAYERS[active] ?? LAYERS[0];
  const beam = { duration: 3.4, pathOpacity: 0.2 } as const;

  return (
    <Section id="architecture">
      <SectionHead
        id="architecture"
        eyebrow="Architecture"
        title={
          <>
            Intelligence that lives <Em>inside</Em> your application.
          </>
        }
        lede="speeq connects natural-language requests to capabilities you approve. It works with your backend, business logic, permissions, models and infrastructure. Your application remains the source of truth."
      />

      <TooltipProvider delayDuration={120}>
        <div ref={container} className="relative">
          <div className="relative grid gap-6 lg:grid-cols-4 lg:items-start lg:gap-8">
            {LAYERS.map((l, i) => (
              <Layer
                key={l.id}
                ref={refs[i]}
                layer={l}
                active={active === i}
                onSelect={() => {
                  setActive(i);
                  setPlaying(false);
                }}
              />
            ))}
          </div>
          {[0, 1, 2].map((i) => {
            const from = refs[i];
            const to = refs[i + 1];
            return from && to ? (
              <AnimatedBeam
                key={LAYERS[i]?.id}
                containerRef={container}
                fromRef={from}
                toRef={to}
                delay={i * 0.6}
                {...beam}
              />
            ) : null;
          })}
        </div>
      </TooltipProvider>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1fr_auto]">
        <div className="panel min-h-[5.5rem] p-4 sm:p-5" aria-live="polite">
          <p className="mono-label mb-1.5 flex items-center gap-2">
            <span className="text-accent">{layer?.step}</span>
            {layer?.title}
          </p>
          <AnimatePresence mode="wait">
            <motion.p
              key={layer?.id}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-[0.92rem] leading-relaxed text-soft"
            >
              {layer?.detail}
            </motion.p>
          </AnimatePresence>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setActive(0);
            setPlaying(true);
          }}
          className="h-11 self-stretch lg:self-auto"
        >
          Trace a request
        </Button>
      </div>

      <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          "No mandatory proprietary backend",
          "No mandatory direct database access",
          "No mandatory vector database",
          "Your application is the source of truth",
        ].map((t) => (
          <p key={t} className="bg-elev px-4 py-3.5 text-[0.82rem] text-soft">
            {t}
          </p>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-line-strong px-4 py-3">
        <Status kind="roadmap" />
        <span className="text-[0.82rem] text-muted">Future extensions:</span>
        {FUTURE.map((f) => (
          <span key={f} className="font-mono text-[0.74rem] text-soft">
            {f}
          </span>
        ))}
      </div>
    </Section>
  );
}

"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Em, Section, SectionHead } from "./kit";

const CASES = [
  {
    id: "commerce",
    label: "E-commerce",
    experience: "Discover products, compare options, manage the cart and move through checkout.",
    say: "Find black T-shirts under ₹500.",
    value: "Product discovery, customer engagement and conversion opportunities.",
    tools: ["products.search", "cart.add", "checkout.start"],
  },
  {
    id: "education",
    label: "Education",
    experience:
      "Find courses and learning resources, explore question banks, get help with the page in front of you, and navigate admissions.",
    say: "Show me GATE questions on normalization.",
    value: "Student engagement, accessibility and admission inquiries.",
    tools: ["questions.search", "courses.list", "admissions.info"],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    experience:
      "Find departments, see which doctors are available, request appointments and reach approved administrative information.",
    say: "Show available cardiologists tomorrow.",
    value: "Patient accessibility and completed appointments.",
    tools: ["departments.list", "slots.search", "appointments.request"],
  },
  {
    id: "finance",
    label: "Financial services",
    experience:
      "Reach authorized account information, find services, look up transactions and get guidance on applications.",
    say: "Show my transactions from last month.",
    value: "Service efficiency and lighter support load.",
    tools: ["transactions.list", "services.find", "applications.guide"],
  },
  {
    id: "logistics",
    label: "Logistics",
    experience: "Track shipments, retrieve delivery details and reach booking services.",
    say: "Show all my delayed shipments.",
    value: "Operational visibility and support efficiency.",
    tools: ["shipments.list", "tracking.get", "bookings.create"],
  },
  {
    id: "saas",
    label: "SaaS and enterprise",
    experience:
      "Discover features, find your way through complex dashboards, pull reports and run approved workflows.",
    say: "Show this month’s sales report.",
    value: "Feature adoption and operational productivity.",
    tools: ["reports.get", "dashboards.open", "workflows.run"],
  },
];

/** Six industries, one idea: you connect approved functionality you already have. */
export function UseCases() {
  const [id, setId] = useState(CASES[0]?.id ?? "commerce");
  const reduce = useReducedMotion();
  const current = CASES.find((c) => c.id === id) ?? CASES[0];

  return (
    <Section id="use-cases">
      <SectionHead
        id="use-cases"
        eyebrow="Use cases"
        title={
          <>
            One interaction layer. <Em>Endless applications.</Em>
          </>
        }
        lede="speeq is for applications with real data, real functionality and real users. In every case, developers connect functionality they already approved."
      />

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr] lg:gap-8">
        <div
          role="tablist"
          aria-label="Industry"
          aria-orientation="vertical"
          className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
        >
          {CASES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              id={`uc-tab-${c.id}`}
              aria-selected={c.id === id}
              aria-controls={`uc-panel-${c.id}`}
              onClick={() => setId(c.id)}
              className={cn(
                "relative shrink-0 rounded-lg border px-3.5 py-2.5 text-left text-[0.88rem] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent",
                c.id === id
                  ? "border-line-strong bg-elev font-medium text-fg"
                  : "border-transparent text-muted hover:text-fg",
              )}
            >
              {c.id === id && (
                <motion.span
                  layoutId="uc-dot"
                  className="absolute top-1/2 left-0 hidden h-5 w-0.5 -translate-y-1/2 rounded bg-accent lg:block"
                />
              )}
              {c.label}
            </button>
          ))}
        </div>

        <div
          className="panel min-h-[19rem] p-5 sm:p-8"
          role="tabpanel"
          id={`uc-panel-${id}`}
          aria-labelledby={`uc-tab-${id}`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {current && (
              <motion.div
                key={current.id}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                <p className="mono-label">Customer says</p>
                <p className="h-display mt-3 text-[clamp(1.4rem,3.6vw,2.1rem)] text-fg">
                  “{current.say}”
                </p>
                <dl className="mt-7 grid gap-6 sm:grid-cols-2">
                  <div>
                    <dt className="mono-label">Customer experience</dt>
                    <dd className="mt-2 text-[0.92rem] leading-relaxed text-soft">
                      {current.experience}
                    </dd>
                  </div>
                  <div>
                    <dt className="mono-label">Business value</dt>
                    <dd className="mt-2 text-[0.92rem] leading-relaxed text-soft">
                      {current.value}
                    </dd>
                  </div>
                </dl>
                <div className="mt-7 border-t border-line pt-5">
                  <p className="mono-label mb-2.5">Developers connect tools like</p>
                  <ul className="flex flex-wrap gap-2">
                    {current.tools.map((t) => (
                      <li
                        key={t}
                        className="rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-[0.76rem] text-soft"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Section>
  );
}

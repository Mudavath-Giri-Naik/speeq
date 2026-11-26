"use client";
import { motion, useReducedMotion } from "motion/react";
import { BlurFade } from "@/components/ui/blur-fade";
import { Em, Frame, Section, SectionHead, Status } from "./kit";

const MOMENTS = [
  {
    page: "shop.example/search?q=wireless+charger",
    context: "Repeated search with no results",
    nudge: "Looking for something specific? I can help you find it.",
    body: ["No results for “wireless charger”", "No results for “wireless charging pad”"],
  },
  {
    page: "college.example/admissions",
    context: "Browsing the admissions page",
    nudge: "Would you like help finding a course that matches your interests?",
    body: ["B.Tech · M.Tech · MBA", "Eligibility · Fees · Deadlines"],
  },
  {
    page: "clinic.example/register",
    context: "A long application form",
    nudge: "Need help completing this section?",
    body: ["Personal details ✓", "Insurance information…"],
  },
  {
    page: "learn.example/dashboard",
    context: "A returning customer",
    nudge: "Would you like to continue where you left off?",
    body: ["Last visit · DBMS, Normalization", "3 saved questions"],
  },
];

/** Context-aware help, shown as a plan. The assistant today answers when it is asked. */
export function Proactive() {
  const reduce = useReducedMotion();
  return (
    <Section id="proactive">
      <SectionHead
        id="proactive"
        eyebrow="Proactive engagement"
        title={
          <>
            Help customers <Em>before they give up.</Em>
          </>
        }
        lede="The best interaction is sometimes the one a customer doesn’t have to start. The goal is gentle, context-aware help that never gets in the way, and that you control."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Status kind="planned" />
        <p className="text-xs text-muted">
          Preview of planned behavior. Today the assistant responds when a visitor asks.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {MOMENTS.map((m, i) => (
          <BlurFade key={m.page} inView delay={i * 0.06}>
            <Frame title={m.page} bodyClassName="relative h-[11.5rem] p-4">
              <p className="mono-label mb-3 !text-[0.62rem]">{m.context}</p>
              <ul className="space-y-2">
                {m.body.map((b) => (
                  <li
                    key={b}
                    className="rounded-md border border-line bg-surface px-2.5 py-2 text-[0.78rem] text-muted"
                  >
                    {b}
                  </li>
                ))}
              </ul>
              <motion.p
                initial={reduce ? false : { opacity: 0, y: 12, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-10%" }}
                transition={{ delay: 0.5 + i * 0.12, duration: 0.45 }}
                className="absolute right-3 bottom-3 left-3 rounded-lg border border-accent/40 bg-elev px-3 py-2.5 text-[0.8rem] leading-snug text-fg shadow-[0_14px_30px_-16px_rgba(0,0,0,0.5)]"
              >
                <span className="mono-label mr-2 !text-accent">speeq</span>
                {m.nudge}
              </motion.p>
            </Frame>
          </BlurFade>
        ))}
      </div>
    </Section>
  );
}

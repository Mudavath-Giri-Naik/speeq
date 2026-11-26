"use client";
import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import { BlurFade } from "@/components/ui/blur-fade";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AnimTabs, AnimTabsContent, AnimTabsList, AnimTabsTrigger } from "./anim-tabs";
import { Em, Section, SectionHead, Status } from "./kit";

// Illustrative numbers. They are fixed so the picture is stable, and the page says they are not real.
const SESSIONS = [18, 22, 20, 27, 31, 29, 36, 34, 41, 39, 47, 52, 49, 58];
const INTENTS = [
  ["Find products", 34],
  ["Order status", 21],
  ["Delivery information", 17],
  ["Returns and refunds", 11],
  ["Everything else", 17],
] as const;
const FUNNEL = [
  ["Asked the assistant", 100],
  ["Matched an approved capability", 78],
  ["Action completed", 61],
  ["Outcome verified by your app", 44],
] as const;
const UNANSWERED = [
  ["Do you ship to my pincode?", "Delivery", "No capability yet"],
  ["Can I change the address after ordering?", "Orders", "Needs a write tool"],
  ["Is there a student discount?", "Pricing", "No knowledge source"],
];

function Spark() {
  const id = useId();
  const reduce = useReducedMotion();
  const w = 560;
  const h = 150;
  const max = Math.max(...SESSIONS);
  const pts = SESSIONS.map(
    (v, i) => [(i / (SESSIONS.length - 1)) * w, h - 12 - (v / max) * (h - 28)] as const,
  );
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full"
      role="img"
      aria-label="Illustrative line chart of assistant sessions rising over two weeks"
    >
      <title>Illustrative line chart of assistant sessions rising over two weeks</title>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1="0"
          x2={w}
          y1={h * t}
          y2={h * t}
          stroke="var(--border)"
          strokeDasharray="3 5"
        />
      ))}
      <path d={area} fill={`url(#${id})`} />
      <motion.path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      />
    </svg>
  );
}

function Bars({ rows }: { rows: ReadonlyArray<readonly [string, number]> }) {
  const reduce = useReducedMotion();
  return (
    <ul className="space-y-3">
      {rows.map(([label, v], i) => (
        <li key={label}>
          <div className="mb-1 flex justify-between text-[0.8rem]">
            <span className="text-soft">{label}</span>
            <span className="font-mono text-muted">{v}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={reduce ? { width: `${v}%` } : { width: 0 }}
              whileInView={{ width: `${v}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: i * 0.08, ease: "easeOut" }}
              style={{ opacity: 1 - i * 0.14 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** An illustrative analytics view built with shadcn cards, tabs and tables. Not live data. */
export function Intelligence() {
  return (
    <Section id="intelligence">
      <SectionHead
        id="intelligence"
        eyebrow="Business intelligence"
        title={
          <>
            Better customer experiences.
            <br />
            <Em>Measurable</Em> business outcomes.
          </>
        }
        lede="Every interaction says what customers need, where they struggle, and whether they reach their goal. speeq’s direction connects intent, action and verified outcome, while the data stays yours."
      />

      <BlurFade inView>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Status kind="preview" />
          <p className="text-xs text-muted">
            Example data to show what you could build. The dashboard is headless too: use your own
            UI.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card className="gap-0 rounded-xl border-line bg-elev py-0 shadow-none">
            <AnimTabs defaultValue="overview">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <div>
                  <CardTitle className="text-[0.95rem] font-semibold text-fg">
                    Assistant activity
                  </CardTitle>
                  <CardDescription className="text-xs text-muted">
                    Last 14 days · example
                  </CardDescription>
                </div>
                <AnimTabsList aria-label="Dashboard view">
                  <AnimTabsTrigger value="overview">Sessions</AnimTabsTrigger>
                  <AnimTabsTrigger value="intents">Intents</AnimTabsTrigger>
                  <AnimTabsTrigger value="funnel">Outcomes</AnimTabsTrigger>
                </AnimTabsList>
              </CardHeader>
              <CardContent className="min-h-[15rem] px-4 py-5 sm:px-5">
                <AnimTabsContent value="overview">
                  <Spark />
                  <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
                    {[
                      ["Sessions", "1,240"],
                      ["Voice share", "38%"],
                      ["Tool success", "94%"],
                      ["Median reply", "1.8 s"],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-elev px-3 py-2.5">
                        <dt className="text-[0.68rem] text-muted">{k}</dt>
                        <dd className="font-mono text-[1.05rem] text-fg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </AnimTabsContent>
                <AnimTabsContent value="intents">
                  <Bars rows={INTENTS} />
                </AnimTabsContent>
                <AnimTabsContent value="funnel">
                  <Bars rows={FUNNEL} />
                </AnimTabsContent>
              </CardContent>
            </AnimTabs>
          </Card>

          <div className="grid gap-4">
            <Card className="gap-2 rounded-xl border-accent/30 bg-accent-soft py-4 shadow-none">
              <CardHeader className="px-4 sm:px-5">
                <CardDescription className="mono-label !text-accent">Insight</CardDescription>
                <CardTitle className="text-[0.95rem] leading-snug font-medium text-fg">
                  Customers often ask about delivery before leaving checkout. Review how visible
                  shipping cost and dates are.
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="gap-0 rounded-xl border-line bg-elev py-0 shadow-none">
              <CardHeader className="border-b border-line px-4 py-3">
                <CardTitle className="text-[0.85rem] font-semibold text-fg">
                  Unanswered questions
                </CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    <TableHead className="pl-4 text-[0.68rem] text-muted">Question</TableHead>
                    <TableHead className="text-[0.68rem] text-muted max-sm:hidden">Gap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {UNANSWERED.map(([q, topic, gap]) => (
                    <TableRow key={q} className="border-line">
                      <TableCell className="py-2.5 pl-4 text-[0.78rem] whitespace-normal text-soft">
                        {q}
                        <span className="mono-label mt-0.5 block !text-[0.58rem]">{topic}</span>
                      </TableCell>
                      <TableCell className="text-[0.72rem] text-muted max-sm:hidden">
                        {gap}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </div>

        <ul className="mt-4 grid gap-2 text-[0.82rem] text-muted sm:grid-cols-2">
          <li className="flex items-start gap-2">
            <Status kind="available" className="mt-0.5 shrink-0" />
            <span>
              Today: a full audit log you can build a viewer on, plus optional anonymous counters on
              a dashboard you run.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Status kind="planned" className="mt-0.5 shrink-0" />
            <span>Next: intent analytics, journeys, lead and conversion insight.</span>
          </li>
        </ul>
      </BlurFade>
    </Section>
  );
}

"use client";
import Link from "next/link";
import { forwardRef, type ReactNode, useRef } from "react";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { AnimatedBeam } from "./animated-beam";
import { Em, Frame, Section, SectionHead, Status } from "./kit";

const TOOLS = ["Claude Code", "Cursor", "Codex"];
const STAGES = [
  "Discover what already exists",
  "Configure the integration",
  "Review the permissions",
  "Validate the application",
  "Build the interactions",
];

const Pill = forwardRef<HTMLDivElement, { children: ReactNode; strong?: boolean }>(
  ({ children, strong }, ref) => (
    <div
      ref={ref}
      className={`relative z-10 rounded-lg border px-3.5 py-2.5 text-center font-mono text-[0.78rem] ${
        strong ? "border-accent/50 bg-accent-soft text-fg" : "border-line-strong bg-elev text-soft"
      }`}
    >
      {children}
    </div>
  ),
);
Pill.displayName = "Pill";

/** Coding agents set speeq up from one prompt today. A dedicated MCP server is planned. */
export function Integrate() {
  const box = useRef<HTMLDivElement>(null);
  const t0 = useRef<HTMLDivElement>(null);
  const t1 = useRef<HTMLDivElement>(null);
  const t2 = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  const repo = useRef<HTMLDivElement>(null);
  const tools = [t0, t1, t2];

  return (
    <Section id="integrate">
      <SectionHead
        id="integrate"
        eyebrow="Developer workflow"
        title={
          <>
            Integrate with the way you <Em>already build.</Em>
          </>
        }
        lede="Many teams build with coding agents. speeq ships one tested prompt that works in Claude Code, Cursor and Codex: it inspects your project, asks before touching data, and builds the integration in small, reviewable steps."
      />

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <BlurFade inView>
          <Frame title="coding agent · your repository" bodyClassName="p-4 sm:p-5">
            <p className="mono-label mb-2">You</p>
            <p className="rounded-lg border border-line bg-surface p-3 text-[0.86rem] leading-relaxed text-fg">
              Integrate speeq into this application. Enable voice interactions, product discovery
              and checkout assistance using my existing services and permissions.
            </p>
            <p className="mono-label mt-5 mb-2">Agent</p>
            <ol className="space-y-1.5">
              {STAGES.map((s, i) => (
                <li
                  key={s}
                  className="flex items-center gap-2.5 font-mono text-[0.76rem] text-soft"
                >
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line-strong text-[0.62rem] text-muted">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
              Wording is an example. The real prompt works in stages and stops to ask before it
              touches data or secrets.
            </p>
          </Frame>
        </BlurFade>

        <BlurFade inView delay={0.08}>
          <div
            ref={box}
            className="relative flex h-full min-h-[18rem] flex-col justify-between gap-6 py-2"
          >
            <div className="grid grid-cols-3 gap-3">
              {TOOLS.map((t, i) => (
                <Pill key={t} ref={tools[i]}>
                  {t}
                </Pill>
              ))}
            </div>
            <div className="mx-auto w-full max-w-[16rem]">
              <Pill ref={mid} strong>
                speeq setup prompt
              </Pill>
            </div>
            <div className="mx-auto w-full max-w-[16rem]">
              <Pill ref={repo}>your application repo</Pill>
            </div>
            {tools.map((r, i) => (
              <AnimatedBeam
                key={TOOLS[i]}
                containerRef={box}
                fromRef={r}
                toRef={mid}
                delay={i * 0.4}
                duration={3.4}
              />
            ))}
            <AnimatedBeam
              containerRef={box}
              fromRef={mid}
              toRef={repo}
              delay={1.2}
              duration={3.4}
            />
          </div>
        </BlurFade>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button asChild>
          <Link href="/docs/ai-setup">Copy the setup prompt</Link>
        </Button>
        <Status kind="available" />
        <span className="text-xs text-muted">Prompt-based setup</span>
        <Status kind="planned" className="sm:ml-2" />
        <span className="text-xs text-muted">A dedicated MCP server</span>
      </div>
    </Section>
  );
}

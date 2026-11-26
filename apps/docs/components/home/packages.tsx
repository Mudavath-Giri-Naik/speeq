"use client";
import Link from "next/link";
import { forwardRef, type ReactNode, useRef } from "react";
import { BlurFade } from "@/components/ui/blur-fade";
import type { PackageStats } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { AnimatedBeam } from "./animated-beam";
import { Em, Section, SectionHead } from "./kit";

const GROUPS = [
  { title: "Core", note: "Shared types and errors", names: ["@speeq/core"] },
  {
    title: "Runtime",
    note: "Server, browser and React",
    names: ["@speeq/server", "@speeq/client", "@speeq/react"],
  },
  {
    title: "Adapters and tools",
    note: "Plug in what you use",
    names: [
      "@speeq/llm-openai-compatible",
      "@speeq/llm-gemini",
      "@speeq/store-memory",
      "@speeq/store-mongodb",
      "@speeq/testing",
    ],
  },
];

const Box = forwardRef<HTMLDivElement, { children: ReactNode; className?: string }>(
  ({ children, className }, ref) => (
    <div ref={ref} className={cn("panel relative z-10 p-4", className)}>
      {children}
    </div>
  ),
);
Box.displayName = "Box";

/** The package map, built from the real list and versions. Adapters depend only on core. */
export function Packages({ packages }: { packages: PackageStats[] }) {
  const box = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const a = useRef<HTMLDivElement>(null);
  const b = useRef<HTMLDivElement>(null);
  const c = useRef<HTMLDivElement>(null);
  const groupRefs = [a, b, c];
  const byName = new Map(packages.map((p) => [p.name, p]));
  const umbrella = byName.get("speeq");

  return (
    <Section id="packages">
      <SectionHead
        id="packages"
        eyebrow="Open-source ecosystem"
        title={
          <>
            One framework. <Em>Modular by design.</Em>
          </>
        }
        lede="Adopt what you need. Extend what you want. Own everything you deploy. Install the umbrella package, or only the pieces you use."
      />
      <div ref={box} className="relative">
        {groupRefs.map((r, i) => (
          <AnimatedBeam
            key={GROUPS[i]?.title}
            containerRef={box}
            fromRef={top}
            toRef={r}
            delay={i * 0.5}
            duration={3.6}
          />
        ))}
        <div className="mx-auto mb-10 max-w-md sm:mb-14">
          <Box ref={top} className="border-accent/40 text-center">
            <p className="font-mono text-[0.95rem] font-medium text-fg">speeq</p>
            <p className="mt-1 text-[0.8rem] text-muted">
              Everything in one package, with small import paths
              {umbrella?.version ? ` · v${umbrella.version}` : ""}
            </p>
          </Box>
        </div>
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          {GROUPS.map((g, i) => (
            <BlurFade key={g.title} inView delay={i * 0.06}>
              <Box ref={groupRefs[i]} className="h-full">
                <p className="mono-label">{g.title}</p>
                <p className="mt-1 mb-3 text-[0.78rem] text-muted">{g.note}</p>
                <ul className="space-y-1.5">
                  {g.names.map((n) => {
                    const p = byName.get(n);
                    return (
                      <li key={n}>
                        <Link
                          href="/docs/packages"
                          className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-2.5 py-2 transition-colors hover:border-accent/50"
                        >
                          <span className="truncate font-mono text-[0.74rem] text-fg">{n}</span>
                          <span className="shrink-0 font-mono text-[0.66rem] text-muted">
                            {p?.version ? `v${p.version}` : ""}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Box>
            </BlurFade>
          ))}
        </div>
      </div>
      <p className="mt-6 text-xs text-muted">
        Versions are read from npm about once an hour.{" "}
        <Link href="/docs/packages" className="text-accent hover:underline">
          Package details
        </Link>
      </p>
    </Section>
  );
}

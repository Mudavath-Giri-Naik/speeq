"use client";
import { CopyButton, CopyButtonIcon } from "@animate-ui/react/primitives/buttons/copy";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { QuickstartTab } from "@/lib/home-code";
import { ArrowIcon, CheckIcon, CopyIcon } from "../icons";
import { InstallTabs } from "./install-tabs";
import { Em, Frame, Section, SectionHead } from "./kit";

const INSTALL_POINTS = [
  "One package, small import paths: speeq/server, speeq/react and more.",
  "Zod is a peer dependency and validates every tool input.",
  "Pre-1.0, so install with the next tag to get the newest releases.",
];

/** Installation and the code you actually write, side by side with what each piece does. */
export function Quickstart({ tabs }: { tabs: QuickstartTab[] }) {
  const reduce = useReducedMotion();
  const [id, setId] = useState("install");
  const current = tabs.find((t) => t.id === id);

  return (
    <Section id="quickstart">
      <SectionHead
        id="quickstart"
        eyebrow="Quickstart"
        title={
          <>
            Built to fit into <Em>your codebase.</Em>
          </>
        }
        lede="Install speeq, connect your existing capabilities, and build the interaction your users deserve. About thirty lines gets a working assistant on a mock model."
      />

      <Tabs value={id} onValueChange={setId} className="gap-4">
        <TabsList
          variant="line"
          className="scroll-thin h-auto max-w-full justify-start gap-1 overflow-x-auto overflow-y-hidden rounded-lg border border-line bg-surface/60 p-1"
        >
          {[{ id: "install", label: "Install" }, ...tabs].map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-8 flex-none rounded-md px-3.5 text-[0.82rem] text-muted data-[state=active]:bg-elev data-[state=active]:text-fg data-[state=active]:shadow-sm"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:gap-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="min-w-0"
            >
              {current ? (
                <Frame
                  title={current.file}
                  right={
                    <CopyButton
                      content={current.code}
                      aria-label={`Copy ${current.label} code`}
                      className="inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <CopyButtonIcon
                        icon={<CopyIcon width={14} height={14} />}
                        copiedIcon={<CheckIcon width={14} height={14} className="text-ok" />}
                      />
                    </CopyButton>
                  }
                >
                  <section
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable code region must be reachable by keyboard
                    tabIndex={0}
                    aria-label={`${current.label} example code`}
                    className="shiki-static scroll-thin max-h-[26rem] overflow-auto bg-[var(--code-bg)] p-4 font-mono text-[0.78rem] leading-[1.7] outline-none focus-visible:ring-2 focus-visible:ring-accent [&_pre]:m-0 [&_pre]:!bg-transparent"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: our own snippets, highlighted at build time
                    dangerouslySetInnerHTML={{ __html: current.html }}
                  />
                </Frame>
              ) : (
                <div className="panel flex min-h-[18rem] flex-col justify-center gap-5 p-5 sm:p-8">
                  <p className="mono-label">Step 1</p>
                  <InstallTabs className="max-w-none" />
                  <p className="text-sm leading-relaxed text-muted">
                    Then mount one route and wrap your app in one provider. That is the whole
                    integration surface.
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="panel flex flex-col p-5 sm:p-6">
            <p className="mono-label">What this does</p>
            <h3 className="h-display mt-3 text-[1.25rem] text-fg">
              {current?.title ?? "Install once"}
            </h3>
            <ul className="mt-4 space-y-2.5">
              {(current?.points ?? INSTALL_POINTS).map((p) => (
                <li key={p} className="flex gap-2.5 text-[0.88rem] leading-snug text-soft">
                  <CheckIcon width={15} height={15} className="mt-0.5 shrink-0 text-accent" />
                  {p}
                </li>
              ))}
            </ul>
            <Button asChild variant="outline" size="sm" className="group mt-6 w-fit self-start">
              <Link href={current?.href ?? "/docs/quickstart"}>
                {current?.cta ?? "Read the quickstart"}
                <ArrowIcon
                  width={14}
                  height={14}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </Button>
          </div>
        </div>
      </Tabs>
    </Section>
  );
}

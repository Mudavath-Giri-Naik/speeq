import Link from "next/link";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { REPO_URL } from "@/lib/site";
import { ArrowIcon, GithubIcon } from "../icons";
import { AskButton, PromptChips } from "./ask";
import { HeroFlow } from "./hero-flow";
import { InstallTabs } from "./install-tabs";
import { Em } from "./kit";

const TRUST = [
  "Open source",
  "MIT licensed",
  "TypeScript-first",
  "Headless",
  "Self-hostable",
  "Bring your own model",
];

export function Hero({ version }: { version: string | null }) {
  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
      <div className="grid-fade pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-80 w-[44rem] max-w-full -translate-x-1/2 rounded-full bg-accent/15 blur-[110px]"
        aria-hidden="true"
      />
      <div className="container-x pt-14 pb-14 sm:pt-20 sm:pb-20 lg:pt-24">
        <div className="mx-auto max-w-4xl text-center">
          <BlurFade delay={0.02}>
            <Link
              href="/docs/releases"
              className="group inline-flex items-center gap-2 rounded-full border border-line-strong bg-elev/80 py-1 pr-3 pl-1 text-xs text-soft transition-colors hover:border-accent/60"
            >
              <span className="rounded-full bg-accent px-2.5 py-0.5 font-medium whitespace-nowrap text-white">
                Open source
              </span>
              <span className="mono-label !tracking-[0.06em] !text-soft normal-case">
                <span className="max-sm:hidden">Interaction infrastructure · </span>
                {version ? `v${version}` : "open source"}
              </span>
              <ArrowIcon
                width={13}
                height={13}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </BlurFade>

          <BlurFade delay={0.08} offset={10}>
            <h1
              id="hero-title"
              className="h-display mt-7 text-[clamp(2.25rem,8.2vw,4.6rem)] text-fg"
            >
              Your website can do more.
              <br />
              Let your users just <Em>ask.</Em>
            </h1>
          </BlurFade>

          <BlurFade delay={0.16} offset={10}>
            <p className="mx-auto mt-6 max-w-2xl text-[1rem] leading-relaxed text-muted sm:text-[1.1rem]">
              speeq connects natural language to your existing application capabilities. Visitors
              find information, take actions and reach their goals, while you keep control of your
              infrastructure, data and interface.
            </p>
          </BlurFade>

          <BlurFade delay={0.24} offset={10}>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="group h-11 px-5 text-[0.92rem] shadow-[0_10px_30px_-12px_var(--glow)]"
              >
                <Link href="/docs/quickstart">
                  Start building
                  <ArrowIcon
                    width={16}
                    height={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 px-5 text-[0.92rem]">
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  <GithubIcon width={16} height={16} />
                  Explore GitHub
                </a>
              </Button>
              <AskButton variant="ghost" className="h-11 px-4 text-[0.92rem]">
                Try speeq on this website
              </AskButton>
            </div>
          </BlurFade>

          <BlurFade delay={0.32} offset={10}>
            <div className="mt-7 flex justify-center">
              <InstallTabs />
            </div>
            <ul
              className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2"
              aria-label="Project facts"
            >
              {TRUST.map((t) => (
                <li key={t} className="mono-label flex items-center gap-2 !text-[0.66rem]">
                  <span className="size-1 rounded-full bg-accent" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </BlurFade>
        </div>

        <BlurFade delay={0.4} offset={14} className="mt-14 sm:mt-20">
          <HeroFlow />
        </BlurFade>

        <BlurFade inView delay={0.05} className="mt-14 sm:mt-20">
          <div className="panel grid items-center gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_1.15fr] lg:gap-10">
            <div>
              <p className="mono-label">This site runs speeq</p>
              <h2 className="h-display mt-3 text-2xl text-fg sm:text-[1.9rem]">
                Don’t just read about speeq. <Em>Experience it.</Em>
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                This website is powered by speeq. Ask a question, explore the project, or navigate
                the docs through conversation. The microphone only starts when you choose it.
              </p>
            </div>
            <PromptChips />
          </div>
        </BlurFade>
      </div>
    </section>
  );
}

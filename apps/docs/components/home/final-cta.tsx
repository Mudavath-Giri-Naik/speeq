import Link from "next/link";
import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { GridPattern } from "@/components/ui/grid-pattern";
import { REPO_URL } from "@/lib/site";
import { ArrowIcon, GithubIcon } from "../icons";
import { AskButton } from "./ask";
import { Em } from "./kit";

/** The close: a statement, three ways in, and a quiet grid behind it. */
export function FinalCta() {
  return (
    <section
      data-flush-footer=""
      className="relative isolate overflow-hidden border-t border-line"
      aria-labelledby="final-title"
    >
      <GridPattern
        width={56}
        height={56}
        className="-z-10 fill-transparent stroke-[var(--border)] [mask-image:radial-gradient(60%_70%_at_50%_50%,#000_20%,transparent_75%)]"
      />
      <div className="container-x py-20 text-center sm:py-28">
        <BlurFade inView>
          <h2
            id="final-title"
            className="h-display mx-auto max-w-4xl text-[clamp(2rem,6.4vw,4.2rem)] text-fg"
          >
            The next generation of websites won’t just respond to clicks.
            <br />
            They’ll respond to <Em>intent.</Em>
          </h2>
        </BlurFade>
        <BlurFade inView delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-[1rem] leading-relaxed text-muted">
            Start building intelligent application experiences with speeq. Open source. Developer
            owned. Built for the web.
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="group h-11 px-6 text-[0.92rem]">
              <Link href="/docs/quickstart">
                Get started
                <ArrowIcon
                  width={16}
                  height={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-6 text-[0.92rem]">
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                <GithubIcon width={16} height={16} />
                Explore GitHub
              </a>
            </Button>
            <AskButton variant="ghost" className="h-11 px-5 text-[0.92rem]">
              Experience speeq
            </AskButton>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}

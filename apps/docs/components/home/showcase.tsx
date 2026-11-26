import { BlurFade } from "@/components/ui/blur-fade";
import { Button } from "@/components/ui/button";
import { ArrowIcon } from "../icons";
import { AskButton } from "./ask";
import { Em, Section, SectionHead } from "./kit";

/** Two real examples: the education platform the demo is modelled on, and this very site. */
export function Showcase() {
  return (
    <Section id="showcase">
      <SectionHead
        id="showcase"
        eyebrow="In the real world"
        title={
          <>
            Built for <Em>real applications.</Em>
          </>
        }
        lede="speeq is meant for products with real data and real users. Here is where the examples on this page come from."
      />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <BlurFade inView>
          <article className="panel flex h-full flex-col p-6 sm:p-8">
            <p className="mono-label">Education</p>
            <h3 className="h-display mt-3 text-[1.5rem] text-fg">
              From question discovery to intelligent learning.
            </h3>
            <p className="mt-3 text-[0.92rem] leading-relaxed text-muted">
              SwaSeekh is an exam-preparation platform built around a question bank. Our education
              demo is modelled on that kind of experience: ask for a subject and topic in your own
              language instead of setting filters by hand.
            </p>
            <p className="mt-3 text-xs text-muted">
              The demo above is a simulation, not a screenshot of that product, and this page makes
              no claim about its results.
            </p>
            <Button asChild variant="outline" className="group mt-auto w-fit self-start">
              <a href="https://swaseekh.in/" target="_blank" rel="noreferrer" className="mt-6">
                Visit SwaSeekh
                <ArrowIcon
                  width={15}
                  height={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
            </Button>
          </article>
        </BlurFade>

        <BlurFade inView delay={0.08}>
          <article className="panel relative flex h-full flex-col overflow-hidden border-accent/40 p-6 sm:p-8">
            <p className="mono-label !text-accent">This website</p>
            <h3 className="h-display mt-3 text-[1.5rem] text-fg">
              You’re already experiencing speeq.
            </h3>
            <p className="mt-3 text-[0.92rem] leading-relaxed text-muted">
              Our own website uses speeq for natural-language interaction, navigation and answers
              about the project. It is the same SDK you would install, running here.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 sm:mt-auto sm:pt-6">
              <AskButton variant="default" question="What can you do?">
                Ask the assistant
              </AskButton>
              <AskButton variant="outline" question="Open the quickstart">
                Open the quickstart by voice or text
              </AskButton>
            </div>
          </article>
        </BlurFade>
      </div>
    </Section>
  );
}

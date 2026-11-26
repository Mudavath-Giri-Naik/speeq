import { BlurFade } from "@/components/ui/blur-fade";
import { AnimatedSpan, Terminal, TypingAnimation } from "@/components/ui/terminal";
import { Em, Section, SectionHead, Status } from "./kit";

const STEPS = [
  {
    n: "Discover",
    t: "Find the routes, endpoints, schemas and forms your application already has.",
  },
  { n: "Approve", t: "Review what speeq may reach, and mark what it must never touch." },
  { n: "Interact", t: "Expose only the approved capabilities to natural language." },
];

/** A roadmap preview of automatic discovery. The scan command is not shipped yet. */
export function Discovery() {
  return (
    <Section id="discovery">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
        <div>
          <SectionHead
            id="discovery"
            eyebrow="Application discovery"
            title={
              <>
                Your application already knows how to work. <Em>speeq should know it too.</Em>
              </>
            }
            lede="The direction: discover existing routes, endpoints, schemas and forms straight from the codebase, so you review and approve instead of writing the same integration by hand."
            className="!mb-6 sm:!mb-8"
          />
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <BlurFade key={s.n} inView delay={i * 0.07}>
                <li className="flex gap-4 rounded-xl border border-line bg-elev p-4">
                  <span className="mono-label !text-accent">0{i + 1}</span>
                  <div>
                    <h3 className="text-[0.95rem] font-semibold text-fg">{s.n}</h3>
                    <p className="mt-1 text-[0.86rem] leading-relaxed text-muted">{s.t}</p>
                  </div>
                </li>
              </BlurFade>
            ))}
          </ol>
        </div>

        <BlurFade inView delay={0.1} className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Status kind="roadmap" />
            <p className="text-xs text-muted">
              Preview only. There is no <code className="font-mono">speeq scan</code> command yet.
            </p>
          </div>
          <Terminal className="!max-h-none !max-w-none text-[0.78rem] [&_pre]:overflow-x-auto [&_pre]:p-4">
            <TypingAnimation className="text-fg" duration={35}>
              {"$ speeq scan"}
            </TypingAnimation>
            <AnimatedSpan className="text-muted">Framework detected: Next.js</AnimatedSpan>
            <AnimatedSpan className="text-ok">✔ Routes discovered</AnimatedSpan>
            <AnimatedSpan className="text-ok">✔ API endpoints analyzed</AnimatedSpan>
            <AnimatedSpan className="text-ok">✔ Server actions discovered</AnimatedSpan>
            <AnimatedSpan className="text-ok">✔ Input schemas detected</AnimatedSpan>
            <AnimatedSpan className="text-ok">✔ Capabilities generated</AnimatedSpan>
            <AnimatedSpan className="text-warn">
              ⚠ Restricted operations flagged for review
            </AnimatedSpan>
            <AnimatedSpan className="text-muted">Permissions: awaiting your approval</AnimatedSpan>
            <AnimatedSpan className="text-fg">Capability manifest ready</AnimatedSpan>
            <AnimatedSpan className="text-muted">
              LLM calls during deterministic discovery: 0
            </AnimatedSpan>
          </Terminal>
        </BlurFade>
      </div>
    </Section>
  );
}

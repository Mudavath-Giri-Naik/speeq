import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Em, Section, SectionHead } from "./kit";

const SPEC: Array<[string, string]> = [
  ["License", "MIT, open source"],
  ["Language", "TypeScript with strict settings"],
  ["Browser client", "No runtime dependencies"],
  ["Responses", "Streamed to the page as they are written"],
  ["Models", "Gemini, Groq, any OpenAI-compatible API, or your own provider"],
  ["Speech", "Browser voice, or server providers you configure"],
  ["Storage", "Memory for development, MongoDB, or your own store"],
  ["Deployment", "Self-hosted, inside your own server"],
  ["Usage counters", "Anonymous, and off until you set an address"],
  ["Validation", "Zod schemas on every tool input"],
];

/** Verified engineering facts only. No benchmarks are claimed because none are published here. */
export function Engineering({ packageCount }: { packageCount: number }) {
  return (
    <Section id="engineering">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
        <div>
          <SectionHead
            id="engineering"
            eyebrow="Engineering"
            title={
              <>
                Engineered for interaction. <Em>Designed for efficiency.</Em>
              </>
            }
            lede="speeq separates natural-language intelligence from validated application execution. It is modular, streams its replies, and leaves every integration under your control."
            className="!mb-8"
          />
          <BlurFade inView>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
              <div className="bg-elev p-5">
                <p className="h-display text-5xl text-fg tabular-nums">
                  <NumberTicker value={packageCount} />
                </p>
                <p className="mt-2 text-[0.82rem] text-muted">small packages, one install</p>
              </div>
              <div className="bg-elev p-5">
                <p className="h-display text-5xl text-fg">0</p>
                <p className="mt-2 text-[0.82rem] text-muted">
                  runtime dependencies in the browser client
                </p>
              </div>
            </div>
          </BlurFade>
        </div>

        <BlurFade inView delay={0.08}>
          <dl className="panel divide-y divide-line">
            {SPEC.map(([k, v]) => (
              <div
                key={k}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4 sm:px-5"
              >
                <dt className="mono-label self-center">{k}</dt>
                <dd className="text-[0.9rem] text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </BlurFade>
      </div>
    </Section>
  );
}

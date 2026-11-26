import { BlurFade } from "@/components/ui/blur-fade";
import { Section, SectionHead } from "./kit";

const GROUPS = [
  {
    name: "Frameworks",
    note: "Next.js adapter today",
    items: ["TypeScript", "JavaScript", "React", "Next.js", "Zod"],
  },
  {
    name: "Models",
    note: "Bring your own",
    items: ["Google Gemini", "Groq", "OpenAI-compatible APIs", "Your own provider"],
  },
  {
    name: "Speech",
    note: "Browser or server",
    items: ["Web Speech API", "Sarvam", "Gemini speech", "OpenAI-style STT and TTS"],
  },
  {
    name: "Storage",
    note: "Conversation store",
    items: ["Memory (development)", "MongoDB", "Your own store"],
  },
];

/** Technologies speeq works with today. These are integrations, not customers or partners. */
export function Stack() {
  return (
    <Section id="stack">
      <SectionHead
        id="stack"
        eyebrow="Compatibility"
        title={
          <>
            Works with your stack.
            <br />
            Not the other way around.
          </>
        }
        lede="Your framework, your backend, your models, your data. These are technologies speeq integrates with, not customers or partners."
      />
      <div className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {GROUPS.map((g, i) => (
          <BlurFade key={g.name} inView delay={i * 0.06} className="bg-elev p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-fg">{g.name}</h3>
              <span className="mono-label !text-[0.62rem]">{g.note}</span>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {g.items.map((item) => (
                <li
                  key={item}
                  className="rounded-md border border-line bg-surface px-2.5 py-1 font-mono text-[0.74rem] text-soft"
                >
                  {item}
                </li>
              ))}
            </ul>
          </BlurFade>
        ))}
      </div>
    </Section>
  );
}

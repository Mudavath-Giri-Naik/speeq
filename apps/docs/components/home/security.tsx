import Link from "next/link";
import { BlurFade } from "@/components/ui/blur-fade";
import {
  ArrowIcon,
  BoltIcon,
  CheckIcon,
  CompassIcon,
  EyeOffIcon,
  ListIcon,
  PlugIcon,
  ShieldIcon,
  WrenchIcon,
} from "../icons";
import { ConfirmFlow } from "./confirm-flow";
import { Em, Section, SectionHead } from "./kit";

const PRINCIPLES = [
  {
    icon: WrenchIcon,
    name: "Your application",
    text: "Reuse the business functionality you already have instead of rebuilding a backend.",
  },
  {
    icon: EyeOffIcon,
    name: "Your data",
    text: "Conversations live in your database. There is no speeq cloud that receives them.",
  },
  {
    icon: BoltIcon,
    name: "Your infrastructure",
    text: "Runs inside your own server, on your own hosting.",
  },
  {
    icon: ShieldIcon,
    name: "Your permissions",
    text: "Only the tools you define are exposed, and your own authorization still applies.",
  },
  {
    icon: CheckIcon,
    name: "Human confirmation",
    text: "Changes to data need a Yes from the visitor before they run.",
  },
  {
    icon: PlugIcon,
    name: "Provider flexibility",
    text: "Choose compatible models, speech providers and storage adapters.",
  },
  {
    icon: ListIcon,
    name: "Auditable",
    text: "Messages, tool calls, errors and approvals are recorded for you to inspect.",
  },
  {
    icon: CompassIcon,
    name: "Headless ownership",
    text: "You control how the assistant looks, behaves and where it appears.",
  },
];

export function Security() {
  return (
    <Section id="security">
      <SectionHead
        id="security"
        eyebrow="Security, privacy and ownership"
        title={
          <>
            Intelligence without <Em>surrendering control.</Em>
          </>
        }
        lede="Your application defines the capabilities. Your policies define the boundaries. speeq connects the interaction."
      />
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
        <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <BlurFade key={p.name} inView delay={i * 0.04} className="bg-elev">
              <li className="flex h-full gap-3.5 p-4 sm:p-5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-accent">
                  <p.icon width={16} height={16} />
                </span>
                <div>
                  <h3 className="text-[0.92rem] font-semibold text-fg">{p.name}</h3>
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-muted">{p.text}</p>
                </div>
              </li>
            </BlurFade>
          ))}
        </ul>

        <BlurFade inView delay={0.1}>
          <div className="panel p-5 sm:p-6">
            <p className="mono-label mb-5">Confirmation flow</p>
            <ConfirmFlow />
            <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted">
              speeq makes no compliance or certification claims. Your deployment, your provider and
              your policies decide those.
            </p>
            <Link
              href="/docs/concepts/security"
              className="group mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent"
            >
              Read the security model
              <ArrowIcon
                width={14}
                height={14}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </BlurFade>
      </div>
    </Section>
  );
}

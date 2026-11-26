import type { ReactNode } from "react";
import { BentoGrid } from "@/components/ui/bento-grid";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";
import { CheckIcon } from "../icons";
import { Em, Section, SectionHead, Status, type StatusKind } from "./kit";
import { Live } from "./live";
import { VoiceVisual } from "./voice-visual";

function Tile({
  name,
  title,
  text,
  status = "available",
  className,
  children,
  delay = 0,
}: {
  name: string;
  title: string;
  text: string;
  status?: StatusKind;
  className?: string;
  children: ReactNode;
  delay?: number;
}) {
  return (
    <BlurFade inView delay={delay} className={cn("col-span-6 flex", className)}>
      <article className="panel group relative flex w-full flex-col overflow-hidden transition-colors duration-300 hover:border-line-strong">
        <div className="flex flex-1 flex-col justify-center border-b border-line bg-surface/40 p-4 sm:p-5">
          {children}
        </div>
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="mono-label">{name}</p>
            {status !== "available" && <Status kind={status} />}
          </div>
          <h3 className="h-display mt-2 text-[1.2rem] text-fg">{title}</h3>
          <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">{text}</p>
        </div>
      </article>
    </BlurFade>
  );
}

function Row({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "wait" | "no" }) {
  return (
    <li className="flex items-center gap-2.5 rounded-md border border-line bg-elev px-2.5 py-2 font-mono text-[0.74rem] text-soft">
      <span
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full text-[0.6rem]",
          tone === "ok" && "bg-ok/15 text-ok",
          tone === "wait" && "bg-warn/15 text-warn",
          tone === "no" && "bg-surface-2 text-muted",
        )}
        aria-hidden="true"
      >
        {tone === "ok" ? <CheckIcon width={10} height={10} /> : tone === "wait" ? "…" : "×"}
      </span>
      {children}
    </li>
  );
}

function Wire({ children, label }: { children: ReactNode; label: string }) {
  return (
    <figure className="m-0">
      <div className="relative h-[4.6rem] overflow-hidden rounded-lg border border-line bg-elev">
        {children}
      </div>
      <figcaption className="mono-label mt-1.5 !text-[0.6rem]">{label}</figcaption>
    </figure>
  );
}

export function Capabilities() {
  return (
    <Section id="capabilities">
      <SectionHead
        id="capabilities"
        eyebrow="Capabilities"
        title={
          <>
            Everything you need to build <Em>intelligent interactions.</Em>
          </>
        }
        lede="Seven building blocks. Each one works on its own, and none of them ships a design. You decide how it looks."
      />
      <BentoGrid className="auto-rows-auto grid-cols-6 gap-3 sm:gap-4">
        <Tile
          name="Voice"
          title="Speak naturally. In your language."
          text="Voice and text on top of the site you already have. English works in every browser; Telugu and Hindi use the server speech provider you configure."
          className="lg:col-span-4"
        >
          <VoiceVisual />
        </Tile>

        <Tile
          name="Actions"
          title="From words to real actions."
          text="Connect requests to validated operations in your existing backend."
          className="sm:col-span-3 lg:col-span-2"
          delay={0.05}
        >
          <ul className="space-y-1.5">
            <Row>request · “Cancel my last order”</Row>
            <Row>tool · cancel_order</Row>
            <Row>input · orderId validated</Row>
            <Row>permission · owner only</Row>
            <Row tone="wait">waiting for the visitor’s Yes</Row>
          </ul>
        </Tile>

        <Tile
          name="Context"
          title="Understands where users are."
          text="Each request can carry the current page and data you choose to share."
          className="sm:col-span-3 lg:col-span-2"
          delay={0.05}
        >
          <div className="space-y-2 font-mono text-[0.74rem]">
            <div className="rounded-md border border-line bg-elev p-2.5 text-soft">
              <p className="text-muted">getContext()</p>
              <p>page: Question details</p>
              <p>subject: DBMS</p>
            </div>
            <div className="mx-auto h-4 w-px bg-line-strong" aria-hidden="true" />
            <div className="rounded-md border border-accent/40 bg-accent-soft p-2.5 text-fg">
              “Explain this question.”
            </div>
          </div>
        </Tile>

        <Tile
          name="Navigation"
          title="Go directly to what matters."
          text="Open the right page through your own router, with filters set."
          className="sm:col-span-3 lg:col-span-2"
          delay={0.1}
        >
          <Live>
            <svg
              viewBox="0 0 240 150"
              className="h-auto w-full"
              role="img"
              aria-label="A path from the home page to a guide through the router"
            >
              <title>A path from the home page to a guide through the router</title>
              {[
                ["/", 20, 24],
                ["/docs/quickstart", 20, 66],
                ["/docs/guides/tools", 20, 108],
              ].map(([label, x, y]) => (
                <g key={label as string}>
                  <rect
                    x={x as number}
                    y={y as number}
                    width="150"
                    height="26"
                    rx="6"
                    className="fill-[var(--bg-elev)] stroke-[var(--border-strong)]"
                  />
                  <text
                    x={(x as number) + 12}
                    y={(y as number) + 17}
                    className="fill-[var(--fg-soft)] font-mono text-[10px]"
                  >
                    {label as string}
                  </text>
                </g>
              ))}
              <path
                d="M 195 37 C 225 37, 225 79, 195 79 M 195 79 C 225 79, 225 121, 195 121"
                fill="none"
                strokeWidth="1.6"
                strokeDasharray="5 5"
                className="stroke-[var(--accent)]"
                style={{ animation: "dash-flow 1.2s linear infinite" }}
              />
              <circle cx="195" cy="121" r="4" className="fill-[var(--accent)]" />
            </svg>
          </Live>
        </Tile>

        <Tile
          name="Security"
          title="Intelligence with boundaries."
          text="Existing authentication, validated inputs and confirmation flows stay in charge."
          className="sm:col-span-6 lg:col-span-2"
          delay={0.1}
        >
          <ul className="space-y-1.5">
            <Row>search_products · read · allowed</Row>
            <Row tone="wait">cancel_order · write · needs Yes</Row>
            <Row tone="no">export_all_users · not exposed</Row>
          </ul>
          <div className="mt-3 flex gap-2" aria-hidden="true">
            <span className="rounded-md bg-accent px-3 py-1 text-[0.72rem] font-medium text-white">
              Yes, cancel
            </span>
            <span className="rounded-md border border-line px-3 py-1 text-[0.72rem] text-muted">
              No
            </span>
          </div>
        </Tile>

        <Tile
          name="Headless SDK"
          title="Your interface. Always."
          text="speeq provides the infrastructure. These are shapes you can build with the same hooks."
          className="lg:col-span-3"
          delay={0.05}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Wire label="Floating">
              <span className="absolute right-2 bottom-2 size-6 rounded-full bg-accent" />
            </Wire>
            <Wire label="Embedded">
              <span className="absolute inset-x-2 top-2 bottom-2 rounded-md border border-line-strong">
                <i className="absolute top-2 left-2 h-1.5 w-10 rounded bg-line-strong" />
                <i className="absolute top-5 left-2 h-1.5 w-14 rounded bg-accent/60" />
              </span>
            </Wire>
            <Wire label="Voice">
              <span className="absolute top-1/2 left-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent" />
              <span className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
            </Wire>
            <Wire label="Search bar">
              <span className="absolute inset-x-2 top-1/2 h-6 -translate-y-1/2 rounded-md border border-line-strong">
                <i className="absolute top-1/2 left-2 h-1.5 w-12 -translate-y-1/2 rounded bg-line-strong" />
              </span>
            </Wire>
          </div>
        </Tile>

        <Tile
          name="Intelligence"
          title="Understand what customers need."
          text="Every turn is auditable today. Intent analytics and conversion insight are the next step."
          className="lg:col-span-3"
          delay={0.1}
        >
          <ul className="space-y-1.5">
            <li className="flex items-center justify-between gap-3 rounded-md border border-line bg-elev px-2.5 py-2 text-[0.78rem] text-soft">
              Audit log of every turn <Status kind="available" />
            </li>
            <li className="flex items-center justify-between gap-3 rounded-md border border-line bg-elev px-2.5 py-2 text-[0.78rem] text-soft">
              Anonymous usage counters <Status kind="available" />
            </li>
            <li className="flex items-center justify-between gap-3 rounded-md border border-line bg-elev px-2.5 py-2 text-[0.78rem] text-soft">
              Intent and conversion insight <Status kind="planned" />
            </li>
          </ul>
        </Tile>
      </BentoGrid>
    </Section>
  );
}

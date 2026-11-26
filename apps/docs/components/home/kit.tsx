import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/ui/blur-fade";
import { cn } from "@/lib/utils";

/** Emphasised word in a heading: editorial serif italic in the brand colour. */
export function Em({ children }: { children: ReactNode }) {
  return <em className="serif-i pr-[0.04em] text-accent">{children}</em>;
}

/** A page section with a hairline on top and a consistent rhythm. */
export function Section({
  id,
  children,
  className,
  bleed = false,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  /** Skip the inner container, for full-width compositions. */
  bleed?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn("relative border-t border-line", className)}
    >
      {bleed ? children : <div className="container-x py-16 sm:py-24">{children}</div>}
    </section>
  );
}

/** Eyebrow, heading and lede, with a gentle entrance. */
export function SectionHead({
  id,
  eyebrow,
  title,
  lede,
  align = "left",
  className,
}: {
  id?: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-10 max-w-3xl sm:mb-14",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <BlurFade inView>
        <p className="mono-label flex items-center gap-2 [&>span]:h-px [&>span]:w-6 [&>span]:bg-accent">
          {align === "left" && <span aria-hidden="true" />}
          {eyebrow}
        </p>
      </BlurFade>
      <BlurFade inView delay={0.06}>
        <h2
          id={id ? `${id}-title` : undefined}
          className="h-display mt-4 text-[clamp(1.85rem,5.4vw,3.1rem)] text-fg"
        >
          {title}
        </h2>
      </BlurFade>
      {lede && (
        <BlurFade inView delay={0.12}>
          <p
            className={cn(
              "mt-5 max-w-2xl text-[0.98rem] leading-relaxed text-muted sm:text-[1.05rem]",
              align === "center" && "mx-auto",
            )}
          >
            {lede}
          </p>
        </BlurFade>
      )}
    </div>
  );
}

const STATUS = {
  available: { label: "Available", dot: "bg-ok" },
  preview: { label: "Illustrative preview", dot: "bg-warn" },
  roadmap: { label: "Roadmap preview", dot: "bg-warn" },
  planned: { label: "Planned", dot: "bg-muted" },
  development: { label: "In development", dot: "bg-accent" },
} as const;

export type StatusKind = keyof typeof STATUS;

/** Marks whether something is shipped today, simulated, or still ahead. The dot never carries it alone. */
export function Status({ kind, className }: { kind: StatusKind; className?: string }) {
  const s = STATUS[kind];
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full border-line-strong bg-transparent px-2.5 py-0.5 font-mono text-[0.66rem] font-medium tracking-wide text-soft uppercase",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden="true" />
      {s.label}
    </Badge>
  );
}

/** A window frame: three dots and a title bar. Used for terminals, apps and editors. */
export function Frame({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn("panel overflow-hidden", className)}>
      <div className="flex items-center gap-3 border-b border-line bg-surface/60 px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-line-strong" />
          <i className="size-2.5 rounded-full bg-line-strong" />
          <i className="size-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[0.72rem] text-muted">{title}</span>
        {right}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

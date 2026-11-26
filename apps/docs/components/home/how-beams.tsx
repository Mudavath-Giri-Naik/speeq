"use client";
import { forwardRef, type ReactNode, useRef } from "react";
import { AnimatedBeam } from "./animated-beam";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const Icons = {
  mic: (
    <svg viewBox="0 0 24 24" className="size-full" {...stroke} aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V22" />
    </svg>
  ),
  type: (
    <svg viewBox="0 0 24 24" className="size-full" {...stroke} aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7 14h10" />
    </svg>
  ),
  page: (
    <svg viewBox="0 0 24 24" className="size-full" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  ),
  model: (
    <svg viewBox="0 0 24 24" className="size-full" {...stroke} aria-hidden="true">
      <path d="M12 3c.7 4.6 4.4 8.3 9 9-4.6.7-8.3 4.4-9 9-.7-4.6-4.4-8.3-9-9 4.6-.7 8.3-4.4 9-9Z" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" className="size-full" {...stroke} aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" />
    </svg>
  ),
  database: (
    <svg viewBox="0 0 24 24" className="size-full" {...stroke} aria-hidden="true">
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  ),
};

const Node = forwardRef<HTMLDivElement, { children: ReactNode; label: string; big?: boolean }>(
  ({ children, label, big }, ref) => (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={ref}
        className={`relative z-10 flex items-center justify-center rounded-2xl border border-line-strong bg-elev p-3 text-accent shadow-[0_14px_34px_-14px_rgba(0,0,0,0.45)] ${
          big
            ? "size-[4.5rem] border-0 bg-gradient-to-br from-[#ff8a3d] via-[#ff5a1f] to-[#ff2e3b] p-0 text-white shadow-[0_20px_50px_-10px_var(--glow)] sm:size-24"
            : "size-12 sm:size-14"
        }`}
      >
        {big ? (
          <span className="font-[family-name:var(--font-display)] text-lg font-extrabold tracking-[-0.06em] text-white sm:text-2xl">
            speeq
          </span>
        ) : (
          <span className="block size-full">{children}</span>
        )}
      </div>
      <span className="text-center text-[0.7rem] font-medium text-muted sm:text-xs">{label}</span>
    </div>
  ),
);
Node.displayName = "Node";

/** The whole journey of one request, drawn as pulses between the pieces. */
export function HowBeams() {
  const container = useRef<HTMLDivElement>(null);
  const voice = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const core = useRef<HTMLDivElement>(null);
  const model = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDivElement>(null);
  const data = useRef<HTMLDivElement>(null);

  const beam = (from: typeof voice, to: typeof core, extra: object = {}) => ({
    containerRef: container,
    fromRef: from,
    toRef: to,
    ...extra,
  });

  return (
    <div
      ref={container}
      className="relative mx-auto flex w-full max-w-3xl items-center justify-between gap-2 overflow-hidden px-1 py-10 sm:px-8"
    >
      <div className="flex flex-col gap-8 sm:gap-10">
        <Node ref={voice} label="Voice">
          {Icons.mic}
        </Node>
        <Node ref={text} label="Typing">
          {Icons.type}
        </Node>
        <Node ref={page} label="Where they are">
          {Icons.page}
        </Node>
      </div>

      <Node ref={core} label="speeq on your server" big>
        {null}
      </Node>

      <div className="flex flex-col gap-8 sm:gap-10">
        <Node ref={model} label="Your model">
          {Icons.model}
        </Node>
        <Node ref={tools} label="Your tools">
          {Icons.tools}
        </Node>
        <Node ref={data} label="Your database">
          {Icons.database}
        </Node>
      </div>

      <AnimatedBeam {...beam(voice, core, { curvature: -70, duration: 4.2 })} />
      <AnimatedBeam {...beam(text, core, { duration: 4.8, delay: 0.4 })} />
      <AnimatedBeam {...beam(page, core, { curvature: 70, duration: 5.2, delay: 0.8 })} />
      <AnimatedBeam
        {...beam(model, core, { curvature: -70, reverse: true, duration: 4.4, delay: 0.2 })}
      />
      <AnimatedBeam {...beam(tools, core, { reverse: true, duration: 5, delay: 0.6 })} />
      <AnimatedBeam
        {...beam(data, core, { curvature: 70, reverse: true, duration: 5.4, delay: 1 })}
      />
    </div>
  );
}

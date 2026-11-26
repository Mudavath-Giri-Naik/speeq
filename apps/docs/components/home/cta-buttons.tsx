"use client";
import Link from "next/link";
import { LiquidButton } from "../animate-ui/buttons/liquid";
import { ArrowIcon } from "../icons";

/** The main call to action. The fill rises like liquid when you hover (from Animate UI). */
export function PrimaryCta({ href, children }: { href: string; children: string }) {
  return (
    <LiquidButton
      asChild
      fillHeight="3px"
      delay="0.35s"
      className="h-[3.1rem] rounded-full bg-[#ff5a1f] px-7 text-[0.95rem] font-semibold text-white shadow-[0_14px_40px_-12px_var(--glow)] [--liquid-button-background-color:#ff5a1f] [--liquid-button-color:#0a0a0a] hover:text-white"
    >
      <Link href={href}>
        {children}
        <ArrowIcon width={18} height={18} />
      </Link>
    </LiquidButton>
  );
}

/** Opens the assistant panel in the corner. */
export function AskAssistantButton({ children }: { children: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("speeq:open-assistant"))}
      className="group inline-flex items-center gap-1.5 font-semibold text-fg transition hover:text-accent"
    >
      {children}
      <ArrowIcon
        width={15}
        height={15}
        className="transition-transform duration-300 group-hover:translate-x-1"
      />
    </button>
  );
}

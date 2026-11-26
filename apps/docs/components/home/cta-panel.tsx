"use client";
import Link from "next/link";
import { StarsBackground } from "../animate-ui/backgrounds/stars";
import { LiquidButton } from "../animate-ui/buttons/liquid";
import { ArrowIcon } from "../icons";
import { CopyCommand } from "./copy-command";
import { Reveal } from "./motion";

/** The closing call to action, on a dark starfield that follows the pointer. */
export function CtaPanel({ command }: { command: string }) {
  return (
    <Reveal>
      <div
        data-theme="dark"
        className="cta-aurora relative isolate overflow-hidden rounded-[2rem] border border-white/10 text-center"
      >
        <StarsBackground
          starColor="#ffffff"
          speed={70}
          factor={0.04}
          className="!absolute !inset-0 !-z-10 !bg-none opacity-70"
        />
        <div className="relative px-6 py-20 sm:py-28">
          <h2 className="mx-auto max-w-3xl font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-[-0.045em] text-white sm:text-6xl">
            Ready to let your site <span className="gradient-text">talk back?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/70 sm:text-lg">
            Install it, mount one route, and say hello in five minutes. No account, no keys.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <LiquidButton
              asChild
              fillHeight="3px"
              delay="0.35s"
              className="h-[3.1rem] rounded-full px-7 text-[0.95rem] font-semibold text-[#12121c] [--liquid-button-background-color:#fff] [--liquid-button-color:#7c5cff] hover:text-white"
            >
              <Link href="/docs/quickstart">
                Get started
                <ArrowIcon width={18} height={18} />
              </Link>
            </LiquidButton>
            <CopyCommand command={command} />
          </div>
        </div>
      </div>
    </Reveal>
  );
}

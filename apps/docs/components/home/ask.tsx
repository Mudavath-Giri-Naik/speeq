"use client";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowIcon, MicIcon } from "../icons";

/** Opens the real speeq assistant that runs on this site. Never starts the microphone. */
export function openAssistant(question?: string) {
  if (question) window.dispatchEvent(new CustomEvent("speeq:ask", { detail: question }));
  else window.dispatchEvent(new Event("speeq:open-assistant"));
}

export function AskButton({
  children,
  question,
  variant = "outline",
  size = "lg",
  className,
}: {
  children: ReactNode;
  question?: string;
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "lg" | "default" | "sm";
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("group", className)}
      onClick={() => openAssistant(question)}
    >
      <MicIcon width={16} height={16} />
      {children}
    </Button>
  );
}

/** Starter questions. Each one is a real question the site's assistant can answer. */
export const STARTER_PROMPTS = [
  "What can you do?",
  "Open the quickstart",
  "Explain how confirmations work",
  "How many installs does speeq have?",
  "Explain speeq in Telugu",
];

export function PromptChips({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Ask the assistant">
      {STARTER_PROMPTS.map((text, i) => (
        <motion.li
          key={text}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.05, duration: 0.4 }}
        >
          <motion.button
            type="button"
            whileHover={reduce ? undefined : { y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => openAssistant(text)}
            className="group inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-elev px-3.5 text-[0.82rem] text-soft transition-colors hover:border-accent/60 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
          >
            {text}
            <ArrowIcon
              width={14}
              height={14}
              className="-ml-1 text-accent opacity-0 transition group-hover:ml-0 group-hover:opacity-100"
            />
          </motion.button>
        </motion.li>
      ))}
    </ul>
  );
}

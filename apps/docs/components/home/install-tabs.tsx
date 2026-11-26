"use client";
import { CopyButton, CopyButtonIcon } from "@animate-ui/react/primitives/buttons/copy";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, CopyIcon } from "../icons";

const MANAGERS = [
  { id: "npm", prefix: "npm i" },
  { id: "pnpm", prefix: "pnpm add" },
  { id: "yarn", prefix: "yarn add" },
  { id: "bun", prefix: "bun add" },
] as const;

/** The install command with a package manager switch and an animated copy button. */
export function InstallTabs({
  packages = "speeq@next zod",
  className,
}: {
  packages?: string;
  className?: string;
}) {
  const [active, setActive] = useState<(typeof MANAGERS)[number]["id"]>("npm");
  const current = MANAGERS.find((m) => m.id === active) ?? MANAGERS[0];
  const command = `${current.prefix} ${packages}`;
  return (
    <div className={cn("panel w-full max-w-md overflow-hidden text-left", className)}>
      <div className="flex items-center justify-between border-b border-line bg-surface/60 pr-1.5 pl-2">
        <div role="tablist" aria-label="Package manager" className="flex">
          {MANAGERS.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={m.id === active}
              onClick={() => setActive(m.id)}
              className={cn(
                "relative h-9 px-2.5 font-mono text-[0.72rem] outline-none transition-colors focus-visible:text-accent",
                m.id === active ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {m.id}
              {m.id === active && (
                <span className="absolute inset-x-2 bottom-0 h-px bg-accent" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        <CopyButton
          content={command}
          aria-label={`Copy: ${command}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
        >
          <CopyButtonIcon
            icon={<CopyIcon width={15} height={15} />}
            copiedIcon={<CheckIcon width={15} height={15} className="text-ok" />}
          />
        </CopyButton>
      </div>
      <p className="scroll-thin overflow-x-auto px-4 py-3.5 font-mono text-[0.84rem] whitespace-nowrap text-fg">
        <span className="text-accent" aria-hidden="true">
          ${" "}
        </span>
        {command}
      </p>
    </div>
  );
}

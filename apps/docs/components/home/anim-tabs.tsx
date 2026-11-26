"use client";
import {
  Root as Tabs,
  Content as TabsContent,
  List as TabsList,
  Trigger as TabsTrigger,
} from "@animate-ui/react/primitives/radix-ui/tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabs from Animate UI: the active tab's look slides to the next one, and panels fade in. Only
 * the colours are ours, so they follow the light and dark theme.
 */
export function AnimTabs(props: ComponentProps<typeof Tabs>) {
  return <Tabs {...props} />;
}

export function AnimTabsList({ className, ...props }: ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        "scroll-thin relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface/70 p-1",
        className,
      )}
      {...props}
    />
  );
}

export function AnimTabsTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent px-3.5 text-[0.82rem] font-medium whitespace-nowrap text-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent data-[state=active]:border-line-strong data-[state=active]:bg-elev data-[state=active]:text-fg data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export const AnimTabsContent = TabsContent;

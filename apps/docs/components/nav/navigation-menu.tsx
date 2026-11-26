"use client";
import { NavigationMenu as Primitive } from "@base-ui/react/navigation-menu";
import type { ComponentProps, ElementType } from "react";
import { cn } from "@/lib/utils";

type P<T extends ElementType> = Omit<ComponentProps<T>, "className"> & { className?: string };

/**
 * The shadcn Navigation Menu (Base UI), dressed for this site: a glass dropdown that grows and
 * shrinks to fit each panel, with panels that slide in the direction you moved.
 */
function NavigationMenu({ className, children, ...props }: P<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      data-slot="navigation-menu"
      delay={60}
      closeDelay={160}
      className={cn("relative flex items-center", className)}
      {...props}
    >
      {children}
      <NavigationMenuPositioner />
    </Primitive.Root>
  );
}

function NavigationMenuList({ className, ...props }: P<typeof Primitive.List>) {
  return (
    <Primitive.List
      data-slot="navigation-menu-list"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  );
}

function NavigationMenuItem({ className, ...props }: P<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  );
}

const triggerClass =
  "group/trigger relative z-10 inline-flex h-10 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[0.9rem] font-medium text-soft outline-none transition-colors hover:text-fg focus-visible:text-fg data-[popup-open]:text-fg";

function NavigationMenuTrigger({ className, children, ...props }: P<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(triggerClass, className)}
      {...props}
    >
      {children}
      <Primitive.Icon className="transition-transform duration-300 group-data-[popup-open]/trigger:rotate-180">
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Primitive.Icon>
    </Primitive.Trigger>
  );
}

function NavigationMenuContent({ className, ...props }: P<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "h-full w-max p-3 transition-[opacity,transform,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        "data-[activation-direction=left]:data-[starting-style]:-translate-x-10 data-[activation-direction=right]:data-[starting-style]:translate-x-10",
        "data-[activation-direction=left]:data-[ending-style]:translate-x-10 data-[activation-direction=right]:data-[ending-style]:-translate-x-10",
        className,
      )}
      {...props}
    />
  );
}

function NavigationMenuPositioner({
  side = "bottom",
  sideOffset = 14,
  align = "start",
  alignOffset = -14,
  ...props
}: P<typeof Primitive.Positioner>) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-[70] h-[var(--positioner-height)] w-[var(--positioner-width)] max-w-[var(--available-width)] transition-[top,left,right,bottom] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[instant]:transition-none"
        {...props}
      >
        <Primitive.Popup
          className={cn(
            "nav-popup relative h-[var(--popup-height)] w-[var(--popup-width)] origin-[var(--transform-origin)] overflow-hidden rounded-[1.4rem] border border-line-strong bg-elev/95 shadow-[0_40px_90px_-20px_rgba(0,0,0,0.7)] backdrop-blur-2xl",
            "transition-[opacity,transform,width,height,scale,translate] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          )}
        >
          <Primitive.Viewport className="relative size-full overflow-hidden" />
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}

function NavigationMenuLink({ className, ...props }: P<typeof Primitive.Link>) {
  return (
    <Primitive.Link
      data-slot="navigation-menu-link"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  triggerClass as navigationMenuTriggerClass,
};

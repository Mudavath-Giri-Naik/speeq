import type { ReactNode } from "react";
import { NavTree } from "../../components/nav-tree";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container-x lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:gap-10">
      <aside className="scroll-thin sticky top-16 hidden h-[calc(100dvh-4rem)] overflow-y-auto py-8 pr-2 lg:block">
        <NavTree />
      </aside>
      <div className="min-w-0 py-8 sm:py-10">{children}</div>
    </div>
  );
}

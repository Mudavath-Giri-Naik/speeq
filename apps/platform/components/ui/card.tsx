import type { ReactNode } from "react";
/** Groups dashboard information under a section heading. */
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
/** Explains how to populate empty telemetry panels. */
export function Empty() {
  return (
    <p className="empty">
      No data yet. Run <code>pnpm --filter @speeq/platform seed</code>
    </p>
  );
}

import { z } from "zod";
/** Dashboard reporting ranges. */
export const RANGES = ["7d", "30d", "90d"] as const;
/** Supported reporting interval. */
export type Range = (typeof RANGES)[number];
/** Validated selection for reporting routes. */
export function parseRange(value: unknown): Range {
  return z.enum(RANGES).catch("30d").parse(value);
}
/** Builds a half-open UTC calendar-day window containing today. */
export function rangeWindow(range: Range, now: Date) {
  const n = Number.parseInt(range, 10),
    end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const from = new Date(end - n * 86400000);
  return {
    from,
    to: new Date(end),
    days: Array.from({ length: n }, (_, i) =>
      new Date(+from + 86400000 * i).toISOString().slice(0, 10),
    ),
  };
}
/** UTC bounds for reporting queries. */
export type Window = ReturnType<typeof rangeWindow>;

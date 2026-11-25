import { LATENCY_BUCKETS_MS } from "@speeq/core";
/** Finds the inclusive upper bound containing a percentile rank. */
export function percentileFromHistogram(
  counts: number[],
  p: number,
): number | { overflow: true } | null {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const target = Math.ceil(total * p);
  let sum = 0;
  for (const [index, c] of counts.entries()) {
    sum += c;
    if (sum >= target) return LATENCY_BUCKETS_MS[index] ?? { overflow: true };
  }
  return null;
}

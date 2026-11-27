import type { IntegrationPlan } from "./plan.js";

const MAX_CELLS = 4_000_000;

/** Unified-style diff of two texts. Large middles that cannot be aligned cheaply become one hunk. */
export function lineDiff(before: string, after: string): string[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ma = a.slice(start, endA);
  const mb = b.slice(start, endB);
  const out: string[] = [];
  if (ma.length * mb.length > MAX_CELLS) {
    for (const l of ma) out.push(`-${l}`);
    for (const l of mb) out.push(`+${l}`);
    return out;
  }
  const w = mb.length + 1;
  const lcs = new Uint32Array((ma.length + 1) * w);
  for (let i = ma.length - 1; i >= 0; i--)
    for (let j = mb.length - 1; j >= 0; j--)
      lcs[i * w + j] =
        ma[i] === mb[j]
          ? (lcs[(i + 1) * w + j + 1] as number) + 1
          : Math.max(lcs[(i + 1) * w + j] as number, lcs[i * w + j + 1] as number);
  let i = 0;
  let j = 0;
  while (i < ma.length && j < mb.length) {
    if (ma[i] === mb[j]) {
      out.push(` ${ma[i]}`);
      i++;
      j++;
    } else if ((lcs[(i + 1) * w + j] as number) >= (lcs[i * w + j + 1] as number))
      out.push(`-${ma[i++]}`);
    else out.push(`+${mb[j++]}`);
  }
  while (i < ma.length) out.push(`-${ma[i++]}`);
  while (j < mb.length) out.push(`+${mb[j++]}`);
  return out;
}
/** Human-readable diff of everything a plan would change. */
export function renderDiff(plan: IntegrationPlan): string {
  const parts: string[] = [];
  for (const c of plan.changes) {
    if (c.action === "keep") continue;
    parts.push(
      `--- ${c.action === "create" ? "/dev/null" : c.path}`,
      `+++ ${c.action === "delete" ? "/dev/null" : c.path}`,
    );
    const lines = lineDiff(c.before ?? "", c.content ?? "").filter((l) => !l.startsWith(" "));
    parts.push(...lines);
  }
  return parts.join("\n");
}

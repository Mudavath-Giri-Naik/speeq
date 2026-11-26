import { z } from "zod";
/** Licensed evaluation corpus with paths relative to its manifest. */
export const Manifest = z
  .object({
    name: z.string().min(1),
    license: z.string().min(1),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          language: z.string().min(1),
          reference: z.string().min(1),
          audio: z
            .string()
            .min(1)
            .refine((p) => !/^([a-z]+:|[/\\])/i.test(p)),
          tags: z.array(z.string()).optional(),
        }),
      )
      .min(1),
  })
  .refine((m) => new Set(m.items.map((i) => i.id)).size === m.items.length);
/** Normalize references and hypotheses identically while preserving Indic marks. */
export function normalize(s: string, strip = false) {
  const normalized = s
    .normalize("NFC")
    .replace(/\p{Script=Latin}/gu, (c) => c.toLowerCase())
    .replace(/\p{P}/gu, " ");
  return (strip ? normalized.replaceAll("\u200d", "") : normalized).trim().replace(/\s+/gu, " ");
}
function distance(a: string[], b: string[]) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (const [i, x] of a.entries()) {
    const next = [i + 1];
    for (const [j, y] of b.entries())
      next.push(
        Math.min((row[j + 1] ?? 0) + 1, (next[j] ?? 0) + 1, (row[j] ?? 0) + Number(x !== y)),
      );
    row = next;
  }
  return row[b.length] ?? 0;
}
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
/** Return additive counts to compute corpus WER and grapheme CER. */
export function errors(ref: string, hyp: string, strip = false) {
  const r = normalize(ref, strip),
    h = normalize(hyp, strip);
  const words = (s: string) => (s ? s.split(" ") : []);
  const chars = (s: string) => Array.from(segmenter.segment(s), (x) => x.segment);
  return {
    wordEdits: distance(words(r), words(h)),
    words: words(r).length,
    charEdits: distance(chars(r), chars(h)),
    chars: chars(r).length,
  };
}
/** Nearest-rank percentile, or null for a group without timings. */
export function percentile(values: number[], p: number) {
  return (
    [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil((values.length * p) / 100) - 1)] ?? null
  );
}

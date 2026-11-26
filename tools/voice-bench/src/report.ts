import { cpus, platform, release } from "node:os";
import { errors, percentile } from "./metrics.js";
/** One scored or timed observation. */
export interface Row {
  language: string;
  tags?: string[];
  reference?: string;
  text?: string;
  ms?: number;
  firstByteMs?: number;
  error?: string;
}
/** Aggregate within languages and within each language's tags. */
export function report(
  rows: Row[],
  options: {
    provider: string;
    model?: string;
    host?: string;
    runs: number;
    concurrency: number;
    networkNote?: string;
    strip?: boolean;
  },
) {
  const groups = new Map<string, Row[]>();
  for (const row of rows)
    for (const tag of new Set([null, ...(row.tags ?? [])])) {
      const key = JSON.stringify([row.language, tag]);
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
  const timings = (xs: number[]) => ({
    p50: percentile(xs, 50),
    p95: percentile(xs, 95),
    p99: percentile(xs, 99),
  });
  const metrics = Array.from(groups, ([key, list]) => {
    const [language, tag] = JSON.parse(key);
    let words = 0,
      chars = 0,
      we = 0,
      ce = 0;
    for (const row of list)
      if (row.reference !== undefined && row.text !== undefined) {
        const e = errors(row.reference, row.text, options.strip);
        words += e.words;
        chars += e.chars;
        we += e.wordEdits;
        ce += e.charEdits;
      }
    return {
      language,
      tag,
      count: list.length,
      wer: words ? we / words : null,
      cer: chars ? ce / chars : null,
      errors: list.filter((r) => r.error).length,
      rateLimited: list.filter((r) => r.error === "RATE_LIMITED").length,
      latencyMs: timings(list.flatMap((r) => r.ms ?? [])),
      firstByteMs: timings(list.flatMap((r) => r.firstByteMs ?? [])),
    };
  });
  return {
    environment: {
      os: `${platform()} ${release()}`,
      node: process.version,
      cpu: cpus()[0]?.model,
      cpuCount: cpus().length,
      date: new Date().toISOString(),
      ...options,
      networkNote: options.networkNote ?? null,
    },
    metrics,
    rows,
  };
}
/** Render human-readable conditions and one row per language/tag. */
export function markdown(r: ReturnType<typeof report>) {
  return [
    "# Voice benchmark",
    "",
    ...Object.entries(r.environment).map(([k, v]) => `- ${k}: ${v ?? "unspecified"}`),
    "",
    "Measured on the above conditions only.",
    "",
    "| Language | Tag | Samples | WER | CER | Errors | 429s | Latency p50/p95/p99 (ms) | First byte p50/p95/p99 (ms) |",
    "|---|---|---:|---:|---:|---:|---:|---|---|",
    ...r.metrics.map((m) =>
      [
        m.language,
        m.tag ?? "all",
        m.count,
        m.wer,
        m.cer,
        m.errors,
        m.rateLimited,
        Object.values(m.latencyMs)
          .map((v) => v ?? "—")
          .join("/"),
        Object.values(m.firstByteMs)
          .map((v) => v ?? "—")
          .join("/"),
      ]
        .map((v) => v ?? "—")
        .join(" | "),
    ),
    "",
  ].join("\n");
}

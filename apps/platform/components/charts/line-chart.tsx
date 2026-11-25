import type { Count } from "../../lib/metrics/query";
import { Empty } from "../ui/card";
import { DistributionTable } from "./bar-chart";
/** Draws an accessible trend line over the UTC reporting period. */
export function LineChart({ data, label }: { data: Count[]; label: string }) {
  const max = Math.max(0, ...data.map((x) => x.value));
  if (!max) return <Empty />;
  const points = data
    .map((x, i) => `${(i * 600) / Math.max(1, data.length - 1)},${105 - (x.value * 100) / max}`)
    .join(" ");
  return (
    <figure>
      <svg role="img" aria-label={label} viewBox="0 0 600 110" preserveAspectRatio="none">
        <polyline points={points} />
      </svg>
      <figcaption>
        {data[0]?.label} — {data.at(-1)?.label} · Peak {max}
      </figcaption>
      <details>
        <summary>Daily values</summary>
        <DistributionTable data={data} />
      </details>
    </figure>
  );
}

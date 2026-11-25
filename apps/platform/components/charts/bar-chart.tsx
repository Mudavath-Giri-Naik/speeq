import type { Count } from "../../lib/metrics/query";
import { Empty } from "../ui/card";
/** Renders daily bars with a numeric equivalent for assistive technology. */
export function BarChart({ data, label }: { data: Count[]; label: string }) {
  const max = Math.max(0, ...data.map((x) => x.value));
  if (!max) return <Empty />;
  const width = 600 / data.length;
  return (
    <figure>
      <svg role="img" aria-label={label} viewBox="0 0 600 110" preserveAspectRatio="none">
        {data.map((x, i) => (
          <rect
            key={x.label}
            x={i * width}
            y={105 - (100 * x.value) / max}
            width={width * 0.78}
            height={(100 * x.value) / max}
          >
            <title>{`${x.label}: ${x.value}`}</title>
          </rect>
        ))}
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
/** Text equivalent of a series. */
export function DistributionTable({ data }: { data: Count[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        {data.map((x) => (
          <tr key={x.label}>
            <td>{x.label}</td>
            <td>{x.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

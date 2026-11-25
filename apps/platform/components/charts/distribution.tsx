import type { Count } from "../../lib/metrics/query";
import { Empty } from "../ui/card";
/** Displays labelled distribution bars with their numerical values. */
export function Distribution({ data, suffix = "" }: { data: Count[]; suffix?: string }) {
  if (!data.length) return <Empty />;
  const max = Math.max(1, ...data.map((x) => x.value));
  return (
    <dl className="distribution">
      {data.map((x) => (
        <div key={x.label}>
          <dt>{x.label}</dt>
          <dd>
            <span className="track">
              <span style={{ width: `${(100 * x.value) / max}%` }} />
            </span>
            <strong>
              {Number(x.value.toFixed(1)).toLocaleString("en-US")}
              {suffix}
            </strong>
          </dd>
        </div>
      ))}
    </dl>
  );
}

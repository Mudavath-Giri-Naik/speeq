"use client";
import { useId, useMemo, useState } from "react";
import type { DailyPoint } from "../lib/stats";

const W = 760;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 40 };

function label(day: string): string {
  const [, m, d] = day.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${Number(d)}`;
}

/** A small hand-drawn area chart. Hover, touch or arrow keys show the exact day. */
export function AreaChart({ points, title }: { points: DailyPoint[]; title: string }) {
  const gradient = useId();
  const [index, setIndex] = useState<number | null>(null);

  const { path, area, xs, ys, max, ticks } = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const maxValue = Math.max(5, ...points.map((p) => p.downloads));
    const niceMax = Math.ceil(maxValue / 5) * 5;
    const xs = points.map(
      (_, i) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
    );
    const ys = points.map((p) => PAD.top + innerH - (p.downloads / niceMax) * innerH);
    const line = xs
      .map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${(ys[i] ?? 0).toFixed(1)}`)
      .join(" ");
    const baseY = PAD.top + innerH;
    const first = xs[0] ?? PAD.left;
    const last = xs[xs.length - 1] ?? PAD.left;
    return {
      path: line,
      area: `${line} L${last.toFixed(1)},${baseY} L${first.toFixed(1)},${baseY} Z`,
      xs,
      ys,
      max: niceMax,
      ticks: [0, 0.5, 1].map((t) => ({
        y: PAD.top + innerH - t * innerH,
        value: Math.round(t * niceMax),
      })),
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted">
        Download history is not available right now.
      </div>
    );
  }

  const current = index === null ? null : points[index];
  const onMove = (clientX: number, rect: DOMRect) => {
    const ratio = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    xs.forEach((x, i) => {
      const dist = Math.abs(x - ratio);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    setIndex(best);
  };

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${title}. ${points.length} days, highest ${Math.max(...points.map((p) => p.downloads))} downloads.`}
          className="h-auto w-full touch-pan-y"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is focusable so arrow keys can read each day
          tabIndex={0}
          onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setIndex(null)}
          onBlur={() => setIndex(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setIndex((i) => Math.min((i ?? -1) + 1, points.length - 1));
            if (e.key === "ArrowLeft") setIndex((i) => Math.max((i ?? points.length) - 1, 0));
            if (e.key === "Escape") setIndex(null);
          }}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t.value}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={t.y}
                y2={t.y}
                stroke="var(--border)"
                strokeDasharray="3 5"
              />
              <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                {t.value}
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#${gradient})`} />
          <path
            d={path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <text x={PAD.left} y={H - 8} fontSize="11" fill="var(--muted)">
            {label(points[0]?.day ?? "")}
          </text>
          <text x={W - PAD.right} y={H - 8} fontSize="11" textAnchor="end" fill="var(--muted)">
            {label(points[points.length - 1]?.day ?? "")}
          </text>
          {index !== null && current && (
            <g>
              <line
                x1={xs[index]}
                x2={xs[index]}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--border-strong)"
              />
              <circle
                cx={xs[index]}
                cy={ys[index]}
                r="5"
                fill="var(--bg)"
                stroke="var(--accent)"
                strokeWidth="2.5"
              />
            </g>
          )}
        </svg>
        {index !== null && current && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-line-strong bg-elev px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `${((xs[index] ?? 0) / W) * 100}%`,
              transform: `translateX(${index > points.length / 2 ? "-105%" : "5%"})`,
            }}
            role="status"
          >
            <div className="text-muted">{label(current.day)}</div>
            <div className="font-semibold text-fg">
              {current.downloads.toLocaleString("en-US")} installs
            </div>
          </div>
        )}
      </div>
      <figcaption className="sr-only">Peak value on the chart axis: {max}</figcaption>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">
          Show the numbers as a table
        </summary>
        <div className="scroll-thin mt-2 max-h-56 overflow-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Installs</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.day} className="border-t border-line">
                  <td className="px-3 py-1.5">{p.day}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.downloads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

"use client";

import { useMemo, useState } from "react";
import { formatEur } from "@/lib/price-format";
import type { CollectionValuePoint } from "@/lib/home-dashboard";

type Props = {
  points: CollectionValuePoint[];
};

type ChartPoint = CollectionValuePoint & { x: number; y: number };

const WIDTH = 720;
const HEIGHT = 230;
const PAD = { top: 18, right: 18, bottom: 34, left: 58 };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}

export function CollectionValueChart({ points }: Props) {
  const [hover, setHover] = useState<ChartPoint | null>(null);
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max((max - min) * 0.15, max * 0.04, 1);
    const yMin = Math.max(0, min - padding);
    const yMax = max + padding;
    const plotWidth = WIDTH - PAD.left - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const x = (index: number) =>
      points.length === 1
        ? PAD.left + plotWidth / 2
        : PAD.left + (index / (points.length - 1)) * plotWidth;
    const y = (value: number) =>
      PAD.top + plotHeight - ((value - yMin) / Math.max(yMax - yMin, 1)) * plotHeight;
    const chartPoints = points.map((point, index) => ({ ...point, x: x(index), y: y(point.value) }));
    const path = chartPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
    const yTicks = Array.from({ length: 4 }, (_, index) => yMin + ((yMax - yMin) * index) / 3);
    return { chartPoints, path, y, yTicks, plotHeight };
  }, [points]);

  if (!chart) {
    return (
      <div className="flex min-h-44 items-center justify-center border-y border-border/70 text-sm text-muted">
        La evolución aparecerá cuando haya juegos con precio en tu colección.
      </div>
    );
  }

  return (
    <div className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto min-w-[320px] w-full"
        role="img"
        aria-label="Evolución del valor estimado de la colección"
      >
        <title>Evolución del valor estimado de la colección</title>
        {chart.yTicks.map((value) => {
          const y = chart.y(value);
          return (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.08}
              />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="fill-muted text-[10px]">
                {Math.round(value).toLocaleString("es-ES")} €
              </text>
            </g>
          );
        })}
        {chart.chartPoints.length > 1 && (
          <path
            d={`${chart.path} L ${chart.chartPoints.at(-1)?.x} ${PAD.top + chart.plotHeight} L ${chart.chartPoints[0].x} ${PAD.top + chart.plotHeight} Z`}
            fill="var(--accent)"
            fillOpacity={0.08}
          />
        )}
        {chart.chartPoints.length > 1 && (
          <path
            d={chart.path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {chart.chartPoints.map((point) => (
          <g key={point.at}>
            <circle
              cx={point.x}
              cy={point.y}
              r={chart.chartPoints.length === 1 ? 5 : 4}
              fill="var(--accent)"
              stroke="var(--card)"
              strokeWidth={2}
              className="cursor-pointer"
              onMouseEnter={() => setHover(point)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(point)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${formatDate(point.at)}: ${formatEur(point.value)}`}
            />
            <text x={point.x} y={HEIGHT - 10} textAnchor="middle" className="fill-muted text-[10px]">
              {formatDate(point.at)}
            </text>
          </g>
        ))}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-border bg-card/95 px-3 py-2 text-xs shadow-sm">
          <p className="font-semibold text-foreground">{formatEur(hover.value)}</p>
          <p className="text-muted">{formatDate(hover.at)}</p>
        </div>
      )}
      {points.length === 1 && (
        <p className="mt-2 text-xs text-muted">Primer registro. La curva crecerá con las próximas actualizaciones.</p>
      )}
    </div>
  );
}

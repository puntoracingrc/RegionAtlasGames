"use client";

import { useMemo, useState } from "react";
import type { ConditionBucket } from "@/lib/condition-prices";
import {
  CONDITION_CHART_COLORS,
  type PriceHistorySnapshot,
} from "@/lib/price-history";
import { formatEur } from "@/lib/catalog";
import { Panel, PanelTitle } from "@/components/ui";

type Props = {
  catalogId: string;
  history: PriceHistorySnapshot[];
};

type Point = { x: number; y: number; at: string; value: number };

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 18, right: 16, bottom: 36, left: 52 };
const BUCKETS: ConditionBucket[] = ["loose", "complete", "sealed"];

function seriesPoints(
  history: PriceHistorySnapshot[],
  bucket: ConditionBucket,
  xScale: (t: number) => number,
  yScale: (v: number) => number,
): Point[][] {
  const segments: Point[][] = [];
  let current: Point[] = [];

  for (const snap of history) {
    const value = snap[bucket];
    if (value == null) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    current.push({
      x: xScale(new Date(snap.at).getTime()),
      y: yScale(value),
      at: snap.at,
      value,
    });
  }
  if (current.length) segments.push(current);
  return segments;
}

function pathFromSegment(segment: Point[]): string {
  if (segment.length === 0) return "";
  if (segment.length === 1) {
    const p = segment[0];
    return `M ${p.x} ${p.y}`;
  }
  return segment
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

function formatAxisDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function formatTooltipDate(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

export function GamePriceHistoryChart({ catalogId, history }: Props) {
  const [hover, setHover] = useState<Point | null>(null);
  const [hoverBucket, setHoverBucket] = useState<ConditionBucket | null>(null);

  const chart = useMemo(() => {
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;

    const values = history.flatMap((snap) =>
      BUCKETS.map((b) => snap[b]).filter((v): v is number => v != null),
    );
    if (values.length === 0) return null;

    const times = history.map((s) => new Date(s.at).getTime());
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const tSpan = Math.max(tMax - tMin, 86_400_000);

    const vMin = Math.min(...values);
    const vMax = Math.max(...values);
    const vPad = Math.max((vMax - vMin) * 0.12, vMax * 0.05, 1);
    const yMin = Math.max(0, vMin - vPad);
    const yMax = vMax + vPad;

    const xScale = (t: number) => PAD.left + ((t - tMin) / tSpan) * plotW;
    const yScale = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const yTicks = 4;
    const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
      yMin + ((yMax - yMin) * i) / yTicks,
    );

    const xTickCount = Math.min(5, history.length);
    const xTickIndexes =
      history.length <= 1
        ? [0]
        : Array.from({ length: xTickCount }, (_, i) =>
            Math.round((i / Math.max(xTickCount - 1, 1)) * (history.length - 1)),
          );

    const series = BUCKETS.map((bucket) => ({
      bucket,
      segments: seriesPoints(history, bucket, xScale, yScale),
      color: CONDITION_CHART_COLORS[bucket].stroke,
    })).filter((s) => s.segments.some((seg) => seg.length > 0));

    return { xScale, yScale, yTickValues, xTickIndexes, series, plotH, plotW, yMin, yMax };
  }, [history]);

  if (!chart || chart.series.length === 0) return null;

  const activeSeries = hoverBucket
    ? chart.series.find((s) => s.bucket === hoverBucket)
    : null;

  return (
    <Panel>
      <PanelTitle>Evolución del precio</PanelTitle>
      <p className="mb-4 text-sm text-muted">
        Medias ponderadas por estado. Se actualiza con cada pasada de recopilación de precios.
      </p>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full min-w-[280px] max-w-full"
          role="img"
          aria-label={`Gráfica de evolución de precios para ${catalogId}`}
        >
          {chart.yTickValues.map((value) => {
            const y = chart.yScale(value);
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
                <text
                  x={PAD.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted text-[10px]"
                >
                  {Math.round(value)}€
                </text>
              </g>
            );
          })}

          {chart.xTickIndexes.map((index) => {
            const snap = history[index];
            const x = chart.xScale(new Date(snap.at).getTime());
            return (
              <text
                key={`${snap.at}-${index}`}
                x={x}
                y={HEIGHT - 10}
                textAnchor="middle"
                className="fill-muted text-[10px]"
              >
                {formatAxisDate(snap.at)}
              </text>
            );
          })}

          {chart.series.map(({ bucket, segments, color }) =>
            segments.map((segment, index) => (
              <g key={`${bucket}-${index}`}>
                {segment.length > 1 && (
                  <path
                    d={pathFromSegment(segment)}
                    fill="none"
                    stroke={color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {segment.map((point) => (
                  <circle
                    key={`${bucket}-${point.at}`}
                    cx={point.x}
                    cy={point.y}
                    r={segment.length === 1 ? 5 : 3.5}
                    fill={color}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                    className="cursor-pointer"
                    onMouseEnter={() => {
                      setHover(point);
                      setHoverBucket(bucket);
                    }}
                    onMouseLeave={() => {
                      setHover(null);
                      setHoverBucket(null);
                    }}
                  />
                ))}
              </g>
            )),
          )}

          {hover && activeSeries && (
            <g pointerEvents="none">
              <line
                x1={hover.x}
                x2={hover.x}
                y1={PAD.top}
                y2={PAD.top + chart.plotH}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeDasharray="4 4"
              />
            </g>
          )}
        </svg>

        {hover && hoverBucket && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs shadow-sm backdrop-blur-sm"
            style={{ left: "50%", transform: "translateX(-50%)" }}
          >
            <p className="font-medium text-foreground">
              {CONDITION_CHART_COLORS[hoverBucket].label}: {formatEur(hover.value)}
            </p>
            <p className="text-muted">{formatTooltipDate(hover.at)}</p>
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {chart.series.map(({ bucket, color }) => (
          <li key={bucket} className="flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-5 rounded-full"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            {CONDITION_CHART_COLORS[bucket].label}
          </li>
        ))}
      </ul>

      {history.length === 1 && (
        <p className="mt-3 text-xs text-muted/80">
          Primer registro. La curva tomará forma con las próximas mediciones.
        </p>
      )}
    </Panel>
  );
}

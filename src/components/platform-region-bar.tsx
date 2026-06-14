"use client";

import { RegionFlag } from "@/components/region-flag";
import { type RegionSlice } from "@/lib/platform-catalog-insights";
import { cn } from "@/lib/cn";

type Props = {
  regions: RegionSlice[];
  total: number;
  selectedRegion: string;
  onSelectRegion: (region: string) => void;
};

export function PlatformRegionBar({ regions, total, selectedRegion, onSelectRegion }: Props) {
  if (regions.length === 0) return null;

  const handleSelect = (label: string) => {
    onSelectRegion(selectedRegion === label ? "all" : label);
  };

  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>Regiones en catálogo</span>
        <span>{total.toLocaleString("es-ES")} títulos</span>
      </div>

      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-foreground/5"
        role="group"
        aria-label="Filtrar por región"
      >
        {regions.map((region) => {
          const active = selectedRegion === region.label;
          return (
            <button
              key={region.label}
              type="button"
              onClick={() => handleSelect(region.label)}
              aria-pressed={active}
              aria-label={`Filtrar por ${region.label}: ${region.count} títulos (${region.pct}%)`}
              title={`${region.label}: ${region.count.toLocaleString("es-ES")} títulos en catálogo`}
              className={cn(
                region.barColorClass,
                "min-w-[4px] cursor-pointer border-0 p-0 transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
                active && "ring-2 ring-accent ring-offset-1 ring-offset-card brightness-110",
              )}
              style={{ width: `${Math.max(region.pct, 0.5)}%` }}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {regions.map((region) => {
          const active = selectedRegion === region.label;
          return (
            <button
              key={region.label}
              type="button"
              onClick={() => handleSelect(region.label)}
              aria-pressed={active}
              aria-label={`Filtrar por ${region.label}: ${region.count} títulos (${region.pct}%)`}
              title={`${region.label}: ${region.count.toLocaleString("es-ES")} títulos`}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border/60 bg-black/10 text-muted hover:border-accent/30 hover:text-foreground",
              )}
            >
              <RegionFlag region={region.label} size="xs" showLabel labelMode="short" />
              <span className={cn("tabular-nums text-foreground/70", active && "text-accent/90")}>
                {region.pct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

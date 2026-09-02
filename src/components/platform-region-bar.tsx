"use client";

import { RegionFlag } from "@/components/region-flag";
import { type RegionSlice } from "@/lib/platform-catalog-insights";
import { cn } from "@/lib/cn";

type Props = {
  regions: RegionSlice[];
  selectedRegion: string;
  onSelectRegion: (region: string) => void;
};

export function PlatformRegionBar({ regions, selectedRegion, onSelectRegion }: Props) {
  if (regions.length === 0) return null;

  const handleSelect = (label: string) => {
    onSelectRegion(selectedRegion === label ? "all" : label);
  };

  return (
    <div className="mt-6 space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="font-medium uppercase tracking-wider">Distribución por región</span>
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
              aria-label={`Filtrar por ${region.label}`}
              title={region.label}
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
              aria-label={`Filtrar por ${region.label}`}
              title={region.label}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border/60 bg-card/70 text-muted hover:border-accent/30 hover:bg-card-hover hover:text-foreground dark:bg-black/10",
              )}
            >
              <span
                className={cn("h-2.5 w-2.5 rounded-full shadow-sm", region.barColorClass)}
                aria-hidden
              />
              <RegionFlag
                region={region.flagRegion ?? region.label}
                size="xs"
                showLabel
                labelMode="short"
                labelOverride={region.flagRegion ? region.label : undefined}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

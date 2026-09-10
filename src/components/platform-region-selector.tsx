"use client";

import { RegionFlag } from "@/components/region-flag";
import { type RegionSlice } from "@/lib/platform-catalog-insights";
import { getRegionDisplay } from "@/lib/region-display";
import { groupRegionOptions, selectedRegionGroup } from "@/lib/region-navigation";
import { cn } from "@/lib/cn";

type Props = {
  regions: RegionSlice[];
  selectedRegion: string;
  onSelectRegion: (region: string) => void;
};

function entryCountLabel(count: number): string {
  return `${count.toLocaleString("es-ES")} ${count === 1 ? "ficha" : "fichas"}`;
}

const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";

export function PlatformRegionSelector({ regions, selectedRegion, onSelectRegion }: Props) {
  if (regions.length === 0) return null;

  const options = regions.map((region) => ({ ...region, value: region.label }));
  const groups = groupRegionOptions(options);
  const selected = options.find((option) => option.value === selectedRegion);
  const selectedGroup = selectedRegionGroup(selectedRegion);
  const active = selectedRegion !== "all";
  const selectedLabel = selected?.label ?? selectedGroup?.label ?? selectedRegion;
  const selectedCount = selected?.count ?? groups.find((group) => group.value === selectedRegion)?.count;

  return (
    <section className="mt-6 space-y-3" aria-label="Regiones por zona">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Región</span>
        <button
          type="button"
          onClick={() => onSelectRegion("all")}
          aria-pressed={!active}
          className={cn("min-h-9 rounded-full border px-3 py-1.5 text-xs transition", focusClass,
            !active ? "border-accent/40 bg-accent/10 text-accent" : "border-border/60 bg-card/70 text-muted hover:text-foreground")}
        >
          Todas
        </button>
        <span className="min-w-0 text-xs text-muted" aria-live="polite" aria-atomic="true">
          {active && <>{selectedLabel}{selectedCount != null && ` · ${entryCountLabel(selectedCount)}`}</>}
        </span>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/90">
        {groups.map((group) => (
          <div
            key={group.id}
            role="group"
            aria-label={group.label}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 border-b border-border/60 p-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)]"
          >
            <button
              type="button"
              onClick={() => onSelectRegion(group.value)}
              aria-pressed={selectedRegion === group.value}
              aria-label={`Filtrar por ${group.label}`}
              title={`Ver ${group.id === "other" || group.id === "pending" ? "todo el grupo" : `toda ${group.label}`}`}
              className={cn("min-h-10 rounded-md text-left text-xs font-semibold transition hover:text-accent sm:text-sm", focusClass,
                selectedRegion === group.value ? "text-accent" : "text-foreground")}
            >
              <span className="block">{group.label}</span>
              {group.count != null && <span className="mt-0.5 block text-[10px] font-normal tabular-nums text-muted sm:text-xs">{entryCountLabel(group.count)}</span>}
            </button>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {group.options.map((option) => {
                const display = getRegionDisplay(option.flagRegion ?? option.label);
                const label = display.shortLabel === "?"
                  ? option.label.replace(/\s*·\s*Mercado por determinar/i, "")
                  : display.shortLabel;
                const description = `${option.label}${option.count != null ? ` · ${entryCountLabel(option.count)}` : ""}`;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSelectRegion(option.value)}
                    aria-pressed={selectedRegion === option.value}
                    aria-label={`Filtrar por ${description}`}
                    title={description}
                    className={cn("inline-flex min-h-10 min-w-11 max-w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition", focusClass,
                      selectedRegion === option.value ? "border-accent/40 bg-accent/10 text-accent" : "border-transparent text-foreground/85 hover:border-accent/30 hover:bg-accent/5")}
                  >
                    <span aria-hidden><RegionFlag region={option.flagRegion ?? option.label} size="xs" /></span>
                    <span className="min-w-0 break-words">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

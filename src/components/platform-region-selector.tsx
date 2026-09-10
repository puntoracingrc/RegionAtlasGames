"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  if (regions.length === 0) return null;

  const options = regions.map((region) => ({ ...region, value: region.label }));
  const groups = groupRegionOptions(options);
  const spain = options.find((option) => getRegionDisplay(option.flagRegion ?? option.label).shortLabel === "ES");
  const selected = options.find((option) => option.value === selectedRegion);
  const selectedGroup = selectedRegionGroup(selectedRegion);
  const active = selectedRegion !== "all";
  const selectedLabel = selected?.label ?? selectedGroup?.label ?? selectedRegion;
  const selectedCount = selected?.count ?? groups.find((group) => group.value === selectedRegion)?.count;

  function choose(value: string) {
    onSelectRegion(value);
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <section className="mt-6 space-y-3" aria-label="Selector de regiones">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Región</span>
        <button
          type="button"
          onClick={() => choose("all")}
          aria-pressed={!active}
          className={cn("min-h-9 rounded-full border px-3 py-1.5 text-xs transition", focusClass,
            !active ? "border-accent/40 bg-accent/10 text-accent" : "border-border/60 bg-card/70 text-muted hover:text-foreground")}
        >
          Todas
        </button>
        {spain && (
          <button
            type="button"
            onClick={() => choose(spain.value)}
            aria-pressed={selectedRegion === spain.value}
            aria-label="Filtrar por España"
            className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition", focusClass,
              selectedRegion === spain.value ? "border-accent/40 bg-accent/10 text-accent" : "border-border/60 bg-card/70 text-muted hover:text-foreground")}
          >
            <RegionFlag region={spain.flagRegion ?? spain.label} size="xs" />
            España
          </button>
        )}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/40", focusClass)}
        >
          {open ? "Cerrar regiones" : active ? "Cambiar región" : "Ver regiones"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {active && (
        <div className="flex items-center gap-2 text-xs" aria-live="polite">
          <span className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 py-1.5 pl-3 pr-1.5 text-foreground">
            {selected && <span aria-hidden><RegionFlag region={selected.flagRegion ?? selected.label} size="xs" /></span>}
            <span className="min-w-0">{selectedLabel}{selectedCount != null && <span className="text-muted"> · {entryCountLabel(selectedCount)}</span>}</span>
            <button
              type="button"
              onClick={() => choose("all")}
              aria-label="Quitar filtro de región"
              className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-accent/15", focusClass)}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        </div>
      )}

      <div id={panelId} hidden={!open}>
        {open && (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-card/90">
            {groups.map((group) => (
              <details key={group.id} className="group/region border-b border-border/60 last:border-b-0">
                <summary className={cn("flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden", focusClass)}>
                  <span className="min-w-0 flex-1">{group.label}</span>
                  {group.count != null && <span className="shrink-0 text-xs font-normal tabular-nums text-muted">{entryCountLabel(group.count)}</span>}
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open/region:rotate-180" aria-hidden />
                </summary>
                <div className="space-y-2 px-3 pb-3">
                  {group.options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => choose(group.value)}
                      aria-pressed={selectedRegion === group.value}
                      className={cn("min-h-9 rounded-lg px-2 text-left text-xs font-semibold text-accent hover:bg-accent/10", focusClass)}
                    >
                      Ver {group.id === "other" || group.id === "pending" ? "todo el grupo" : `toda ${group.label}`}
                    </button>
                  )}
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {group.options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => choose(option.value)}
                        aria-pressed={selectedRegion === option.value}
                        className={cn("flex min-h-10 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition", focusClass,
                          selectedRegion === option.value ? "border-accent/40 bg-accent/10 text-foreground" : "border-border/60 text-foreground/85 hover:border-accent/40 hover:bg-card-hover")}
                      >
                        <span aria-hidden><RegionFlag region={option.flagRegion ?? option.label} size="xs" /></span>
                        <span className="min-w-0 flex-1">{option.label}</span>
                        {option.count != null && <span className="shrink-0 tabular-nums text-muted" aria-label={entryCountLabel(option.count)}>{option.count.toLocaleString("es-ES")}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

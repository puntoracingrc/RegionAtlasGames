"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { RegionFlag } from "@/components/region-flag";
import { cn } from "@/lib/cn";

export type PhysicalEditionPriceOption = {
  id: string;
  label: string;
  broadRegion: string;
  broadRegionLabel: string;
  regions: string[];
  content: ReactNode;
};

export function PhysicalEditionPriceSwitcher({
  options,
  initialEditionId,
}: {
  options: PhysicalEditionPriceOption[];
  initialEditionId?: string;
}) {
  const initial = options.some((option) => option.id === initialEditionId)
    ? initialEditionId!
    : options[0]?.id;
  const [selectedId, setSelectedId] = useState(initial);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === selectedId));
  const selected = options[selectedIndex];
  if (!selected) return null;
  if (options.length === 1) return selected.content;

  const broadRegions = [...new Map(
    options.map((option) => [option.broadRegion, option.broadRegionLabel]),
  )];
  const regionalOptions = options.filter(
    (option) => option.broadRegion === selected.broadRegion,
  );

  function move(offset: number) {
    const nextIndex = (selectedIndex + offset + options.length) % options.length;
    setSelectedId(options[nextIndex].id);
  }

  return (
    <section aria-label="Precios por edición física" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted">Precios por edición</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{selected.label}</p>
            {selected.regions.map((region) => (
              <RegionFlag key={region} region={region} size="xs" showLabel labelMode="short" />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-muted">
            {selectedIndex + 1} / {options.length}
          </span>
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Precio de la edición anterior"
            title="Edición anterior"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-card-hover"
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Precio de la edición siguiente"
            title="Edición siguiente"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:bg-card-hover"
          >
            <ChevronRight aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>

      {broadRegions.length > 1 ? (
        <div role="tablist" aria-label="Región del precio" className="flex flex-wrap gap-2">
          {broadRegions.map(([region, label]) => {
            const active = region === selected.broadRegion;
            const firstEdition = options.find((option) => option.broadRegion === region)!;
            return (
              <button
                key={region}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`price-panel-${firstEdition.id}`}
                onClick={() => setSelectedId(firstEdition.id)}
                className={cn(
                  "min-h-9 rounded-md border px-3 py-2 text-xs font-semibold transition",
                  active
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-card text-foreground hover:bg-card-hover",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {regionalOptions.length > 1 ? (
        <div role="tablist" aria-label="Edición física del precio" className="flex flex-wrap gap-2">
          {regionalOptions.map((option) => {
            const active = option.id === selected.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`price-panel-${option.id}`}
                onClick={() => setSelectedId(option.id)}
                className={cn(
                  "flex min-h-10 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-semibold transition",
                  active
                    ? "border-accent bg-accent/15 text-foreground"
                    : "border-border bg-card text-foreground hover:bg-card-hover",
                )}
              >
                <span className="min-w-0">{option.label}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {option.regions.map((region) => (
                    <RegionFlag key={region} region={region} size="xs" />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        id={`price-panel-${selected.id}`}
        role="tabpanel"
        aria-label={`Precio de ${selected.label}`}
      >
        {selected.content}
      </div>
    </section>
  );
}

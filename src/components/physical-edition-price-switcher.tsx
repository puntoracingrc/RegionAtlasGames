"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
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
  const optionsRailRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const hasPositionedSelectionRef = useRef(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === selectedId));
  const selected = options[selectedIndex];

  useLayoutEffect(() => {
    if (!selectedId) return;
    const rail = optionsRailRef.current;
    const option = optionRefs.current.get(selectedId);
    if (!rail || !option) return;
    const railRect = rail.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    rail.scrollTo({
      behavior: hasPositionedSelectionRef.current ? "smooth" : "auto",
      left:
        rail.scrollLeft +
        optionRect.left -
        railRect.left -
        (rail.clientWidth - optionRect.width) / 2,
    });
    hasPositionedSelectionRef.current = true;
  }, [selectedId]);

  if (!selected) return null;
  if (options.length === 1) return selected.content;

  function move(offset: number) {
    const nextIndex = (selectedIndex + offset + options.length) % options.length;
    setSelectedId(options[nextIndex].id);
  }

  return (
    <section aria-label="Precios por edición física" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-muted">Precios por edición</p>
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

      <div
        ref={optionsRailRef}
        role="tablist"
        aria-label="Edición física del precio"
        className="flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
      >
        {options.map((option) => {
          const active = option.id === selected.id;
          return (
            <button
              key={option.id}
              ref={(node) => {
                if (node) optionRefs.current.set(option.id, node);
                else optionRefs.current.delete(option.id);
              }}
              id={`price-tab-${option.id}`}
              data-broad-region={option.broadRegion}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`price-panel-${option.id}`}
              onClick={() => setSelectedId(option.id)}
              className={cn(
                "catalog-price-option flex min-h-16 w-[17rem] shrink-0 snap-start flex-col justify-center rounded-md border px-3 py-2 text-left transition sm:w-[19rem]",
                active
                  ? "border-accent ring-1 ring-inset ring-accent/60"
                  : "border-border/80 hover:border-foreground/25 hover:brightness-110",
              )}
            >
              <span className="text-[10px] font-semibold uppercase text-muted">
                {option.broadRegionLabel}
              </span>
              <span className="mt-1 flex min-w-0 items-center gap-2">
                <span className="min-w-0 text-xs font-semibold leading-tight text-foreground">
                  {option.label}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {[...new Set(option.regions)].map((region) => (
                    <RegionFlag key={region} region={region} size="xs" />
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden">
        <div
          className="flex items-stretch transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${selectedIndex * 100}%)` }}
        >
          {options.map((option) => {
            const active = option.id === selected.id;
            return (
              <div
                key={option.id}
                id={`price-panel-${option.id}`}
                role="tabpanel"
                aria-labelledby={`price-tab-${option.id}`}
                aria-hidden={!active}
                className="w-full shrink-0 [&>section]:h-full"
              >
                {option.content}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

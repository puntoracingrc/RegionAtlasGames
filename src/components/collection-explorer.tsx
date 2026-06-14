"use client";

import { useMemo, useState } from "react";
import { CollectionGameCard } from "@/components/game-card";
import { HighlightLegend } from "@/components/highlight-legend";
import { CollectionValueUpsell } from "@/components/collection-value-upsell";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { formatEur } from "@/lib/catalog";
import {
  COLLECTION_SORT_OPTIONS,
  DEFAULT_COLLECTION_FILTERS,
  collectionDeveloperOptions,
  collectionPlatformOptions,
  collectionPublisherOptions,
  filterCollection,
  hasActiveCollectionFilters,
} from "@/lib/collection-filters";
import type { CollectionSummary } from "@/lib/collection-store";
import type { CollectionView, GameFilters } from "@/lib/types";

type Props = {
  items: CollectionView[];
  summary: CollectionSummary;
  canViewCollectionValue: boolean;
};

const selectClass =
  "rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 focus:ring-2";

const searchClass =
  "rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted/90 focus:ring-2 xl:col-span-3";

export function CollectionExplorer({ items, summary, canViewCollectionValue }: Props) {
  const [filters, setFilters] = useState<GameFilters>(DEFAULT_COLLECTION_FILTERS);

  const platformOptions = useMemo(() => collectionPlatformOptions(items), [items]);
  const developerOptions = useMemo(() => collectionDeveloperOptions(items), [items]);
  const publisherOptions = useMemo(() => collectionPublisherOptions(items), [items]);

  const filtered = useMemo(() => filterCollection(items, filters), [items, filters]);
  const filteredValue = filtered.reduce((sum, g) => sum + (g.totalValue || 0), 0);
  const filtersActive = hasActiveCollectionFilters(filters);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">Catálogo enlazado</h2>
        <p className="text-sm text-muted">
          Juegos con ficha oficial en Region Atlas. El resto está en las secciones de pendientes y
          plataformas sin catálogo arriba.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ítems retro" value={String(summary.retroItems)} hint={`${summary.totalUnits} unidades`} />
        {canViewCollectionValue ? (
          <>
            <StatCard
              label="Valor venta"
              value={formatEur(summary.totalRecommendedValue)}
              hint={`${summary.withEsPrice} con precio actualizado`}
            />
            <StatCard label="Inversión compra" value={formatEur(summary.totalBuyValue)} hint="Base de coste" />
          </>
        ) : (
          <StatCard
            label="Valor venta"
            value="Pro"
            hint={`${summary.withEsPrice} con precio · desbloquea el total en Ajustes`}
            locked
          />
        )}
        <StatCard
          label="Fuera catálogo retro"
          value={String(summary.outOfScopeItems)}
          hint="PS5 y otras plataformas vivas"
          accent="rose"
        />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            type="search"
            placeholder="Buscar título, plataforma, compañía…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className={searchClass}
          />
          <select
            value={filters.platform}
            onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}
            className={selectClass}
          >
            <option value="all">Todas las plataformas ({items.length})</option>
            {platformOptions.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name} ({p.count})
              </option>
            ))}
          </select>
          {developerOptions.length > 0 && (
            <select
              value={filters.developer}
              onChange={(e) => setFilters((f) => ({ ...f, developer: e.target.value }))}
              className={selectClass}
            >
              <option value="all">Todas las desarrolladoras</option>
              {developerOptions.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.name} ({d.count})
                </option>
              ))}
            </select>
          )}
          {publisherOptions.length > 0 && (
            <select
              value={filters.publisher}
              onChange={(e) => setFilters((f) => ({ ...f, publisher: e.target.value }))}
              className={selectClass}
            >
              <option value="all">Todas las publicadoras</option>
              {publisherOptions.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
          )}
          <select
            value={filters.sort}
            onChange={(e) =>
              setFilters((f) => ({ ...f, sort: e.target.value as GameFilters["sort"] }))
            }
            className={selectClass}
          >
            {COLLECTION_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_COLLECTION_FILTERS)}
              className="rounded-xl border border-border bg-input px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-card-hover"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-foreground/85">
          <span>
            Mostrando <strong className="font-semibold text-foreground">{filtered.length}</strong> juegos
          </span>
          {canViewCollectionValue ? (
            <span>
              Valor filtrado:{" "}
              <strong className="font-semibold text-foreground">{formatEur(filteredValue)}</strong>
            </span>
          ) : (
            <CollectionValueUpsell compact />
          )}
        </div>
        <div className="mt-2 border-t border-border/60 pt-3">
          <HighlightLegend subdued={false} />
        </div>
      </section>

      <section className={CATALOG_GRID_CLASS}>
        {filtered.map((game) => (
          <CollectionGameCard key={game.id} game={game} />
        ))}
      </section>

      {filtered.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          {items.length === 0
            ? "Aún no has importado ningún juego. Sube un Excel arriba para empezar."
            : "No hay juegos con estos filtros."}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent = "amber",
  locked = false,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: "amber" | "rose";
  locked?: boolean;
}) {
  const color = locked ? "text-muted" : accent === "rose" ? "text-rose-300" : "text-accent";
  return (
    <article className="rounded-2xl border border-border bg-gradient-to-br from-white/[0.05] to-transparent p-5">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </article>
  );
}

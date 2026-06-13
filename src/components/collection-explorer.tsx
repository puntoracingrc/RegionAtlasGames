"use client";

import { useMemo, useState } from "react";
import { CollectionGameCard } from "@/components/game-card";
import { HighlightLegend } from "@/components/highlight-legend";
import { CollectionValueUpsell } from "@/components/collection-value-upsell";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { filterCollection, formatEur, platforms } from "@/lib/catalog";
import type { CollectionSummary } from "@/lib/collection-store";
import type { CollectionView, GameFilters } from "@/lib/types";

type Props = {
  items: CollectionView[];
  summary: CollectionSummary;
  canViewCollectionValue: boolean;
};

export function CollectionExplorer({ items, summary, canViewCollectionValue }: Props) {
  const [filters, setFilters] = useState<GameFilters>({
    q: "",
    platform: "all",
    sealed: "all",
    priced: "all",
  });

  const filtered = useMemo(() => filterCollection(items, filters), [items, filters]);
  const filteredValue = filtered.reduce((sum, g) => sum + (g.totalValue || 0), 0);

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
              label="Valor venta ES"
              value={formatEur(summary.totalRecommendedValue)}
              hint={`${summary.withEsPrice} con precio actualizado`}
            />
            <StatCard label="Inversión compra" value={formatEur(summary.totalBuyValue)} hint="Base de coste" />
          </>
        ) : (
          <StatCard
            label="Valor venta ES"
            value="Pro"
            hint={`${summary.withEsPrice} con precio ES · desbloquea el total en Ajustes`}
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
        <div className="grid gap-3 md:grid-cols-4">
          <input
            type="search"
            placeholder="Buscar título, plataforma..."
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            className="rounded-xl border border-border bg-black/30 px-4 py-2.5 text-sm outline-none ring-accent/30 placeholder:text-muted focus:ring-2 md:col-span-2"
          />
          <select
            value={filters.platform}
            onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}
            className="rounded-xl border border-border bg-black/30 px-4 py-2.5 text-sm outline-none"
          >
            <option value="all">Todas las plataformas</option>
            {platforms.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.shortName}
              </option>
            ))}
          </select>
          <select
            value={filters.priced}
            onChange={(e) =>
              setFilters((f) => ({ ...f, priced: e.target.value as GameFilters["priced"] }))
            }
            className="rounded-xl border border-border bg-black/30 px-4 py-2.5 text-sm outline-none"
          >
            <option value="all">Todos los precios</option>
            <option value="yes">Con precio ES</option>
            <option value="no">Pendientes</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>
            Mostrando <strong className="text-foreground">{filtered.length}</strong> juegos
          </span>
          {canViewCollectionValue ? (
            <span>Valor filtrado: {formatEur(filteredValue)}</span>
          ) : (
            <CollectionValueUpsell compact />
          )}
        </div>
        <div className="mt-2">
          <HighlightLegend />
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

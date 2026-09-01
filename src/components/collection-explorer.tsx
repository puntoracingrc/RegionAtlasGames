"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { CollectionGameCard } from "@/components/game-card";
import { HighlightLegend } from "@/components/highlight-legend";
import { CollectionValueUpsell } from "@/components/collection-value-upsell";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { formatEur } from "@/lib/price-format";
import {
  COLLECTION_SORT_OPTIONS,
  DEFAULT_COLLECTION_FILTERS,
  collectionDeveloperOptions,
  collectionPlatformOptions,
  collectionPublisherOptions,
  filterCollection,
  hasActiveCollectionFilters,
  sortCollectionDisplayItems,
} from "@/lib/collection-filters";
import type { CollectionSummary } from "@/lib/collection-store";
import type { CollectionListingState, CollectionView, GameFilters } from "@/lib/types";
import {
  collectionConditionValues,
  groupCollectionDisplayItems,
  type CollectionDisplayItem,
} from "@/lib/collection-display";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { RegionFlag } from "@/components/region-flag";
import { IntentLink } from "@/components/intent-link";
import { collectionCatalogAnchorId, collectionCatalogPath } from "@/lib/collection-path";
import { LinkPendingFeedback } from "@/components/link-pending-feedback";

type Props = {
  items: CollectionView[];
  summary: CollectionSummary;
  canViewCollectionValue: boolean;
  listingStateByItemId: Record<string, CollectionListingState>;
};

const selectClass =
  "rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 focus:ring-2";

const searchClass =
  "rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted/90 focus:ring-2 xl:col-span-2";

export function CollectionExplorer({
  items,
  summary,
  canViewCollectionValue,
  listingStateByItemId,
}: Props) {
  const [filters, setFilters] = useState<GameFilters>(DEFAULT_COLLECTION_FILTERS);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const groupedItems = useMemo(() => groupCollectionDisplayItems(items).map((item) => item.game), [items]);
  const platformOptions = useMemo(() => collectionPlatformOptions(groupedItems), [groupedItems]);
  const developerOptions = useMemo(() => collectionDeveloperOptions(groupedItems), [groupedItems]);
  const publisherOptions = useMemo(() => collectionPublisherOptions(groupedItems), [groupedItems]);

  const filtered = useMemo(
    () => filterCollection(items, filters, listingStateByItemId),
    [items, filters, listingStateByItemId],
  );
  const displayed = useMemo(
    () => sortCollectionDisplayItems(groupCollectionDisplayItems(filtered), filters.sort),
    [filtered, filters.sort],
  );
  const activeSaleKeys = useMemo(
    () =>
      new Set(
        items.flatMap((item) =>
          listingStateByItemId[item.id] === "active"
            ? [item.catalogMatched && item.catalogId ? item.catalogId : item.id]
            : [],
        ),
      ),
    [items, listingStateByItemId],
  );
  const displayedUnits = displayed.reduce((sum, item) => sum + item.units, 0);
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
            value="—"
            hint={`${summary.withEsPrice} con precio · inicia sesión para ver el total`}
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
            className={`${selectClass} xl:col-span-2`}
            aria-label="Filtrar por plataforma"
          >
            <option value="all">Todas las plataformas ({groupedItems.length})</option>
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
            aria-label="Ordenar colección"
          >
            {COLLECTION_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={filters.condition}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                condition: e.target.value as GameFilters["condition"],
              }))
            }
            className={selectClass}
            aria-label="Filtrar por estado"
          >
            <option value="all">Todos los estados</option>
            <option value="sealed">Precintado</option>
            <option value="complete">Abierto y completo</option>
            <option value="game-manual">Juego + manual</option>
            <option value="loose">Solo juego</option>
          </select>
          <select
            value={filters.sale}
            onChange={(e) =>
              setFilters((f) => ({ ...f, sale: e.target.value as GameFilters["sale"] }))
            }
            className={selectClass}
            aria-label="Filtrar por estado de venta"
          >
            <option value="all">Todos los anuncios</option>
            <option value="active">A la venta</option>
            <option value="draft">Borrador de venta</option>
            <option value="pending-sale">Venta pendiente de confirmar</option>
            <option value="not-listed">No anunciado</option>
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
            Mostrando <strong className="font-semibold text-foreground">{displayed.length}</strong>{" "}
            {displayed.length === 1 ? "juego" : "juegos"}
            {displayedUnits !== displayed.length ? ` · ${displayedUnits} unidades` : ""}
          </span>
          <div className="flex items-center gap-3">
            {canViewCollectionValue ? (
              <span>
                Valor filtrado:{" "}
                <strong className="font-semibold text-foreground">{formatEur(filteredValue)}</strong>
              </span>
            ) : (
              <CollectionValueUpsell compact />
            )}
            <div className="inline-flex rounded-lg border border-border bg-input p-0.5" aria-label="Vista de la colección">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                aria-label="Ver como cuadrícula"
                aria-pressed={viewMode === "grid"}
                title="Cuadrícula"
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                  viewMode === "grid" ? "bg-card-hover text-accent shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-label="Ver como lista compacta"
                aria-pressed={viewMode === "list"}
                title="Lista compacta"
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                  viewMode === "list" ? "bg-card-hover text-accent shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                <Rows3 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-2 border-t border-border/60 pt-3">
          <HighlightLegend subdued={false} />
        </div>
      </section>

      {viewMode === "grid" ? (
        <section className={CATALOG_GRID_CLASS}>
          {displayed.map((item) => {
            const { game, conditionCounts } = item;
            return (
              <div
                key={game.catalogId ?? game.id}
                id={collectionCatalogAnchorId(game.catalogId ?? game.id)}
                className="h-full scroll-mt-24"
              >
                <CollectionGameCard
                  game={game}
                  conditionCounts={conditionCounts}
                  conditionValues={collectionConditionValues(item)}
                  hasActiveListing={activeSaleKeys.has(
                    game.catalogMatched && game.catalogId ? game.catalogId : game.id,
                  )}
                />
              </div>
            );
          })}
        </section>
      ) : (
        <section className="divide-y divide-border/70 border-y border-border/70">
          {displayed.map((item) => (
            <CollectionCompactRow key={item.game.catalogId ?? item.game.id} item={item} />
          ))}
        </section>
      )}

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

function CollectionCompactRow({ item }: { item: CollectionDisplayItem }) {
  const { game } = item;
  const href = game.catalogId && game.catalogMatched
    ? collectionCatalogPath(game.catalogId)
    : `/coleccion/${game.id}`;
  const cover = getCoverSrc(game.coverUrl, game.catalogId ?? game.id);
  const conditionValues = collectionConditionValues(item);

  return (
    <IntentLink
      href={href}
      id={collectionCatalogAnchorId(game.catalogId ?? game.id)}
      className="group relative grid min-h-[76px] grid-cols-[42px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-1 py-2.5 transition [content-visibility:auto] hover:bg-card-hover sm:px-2 md:grid-cols-[46px_minmax(190px,0.8fr)_minmax(340px,1.4fr)]"
    >
      <div className="flex h-14 w-11 items-center justify-center overflow-hidden border border-border bg-card">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        ) : (
          <span className="px-1 text-center text-[8px] uppercase text-muted">Sin portada</span>
        )}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-accent">
          {decodeHtmlEntities(game.title)}
        </h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
          <span className="uppercase">{game.platformSlug}</span>
          <span aria-hidden>·</span>
          <RegionFlag region={game.region} size="xs" showLabel labelMode="short" />
        </p>
      </div>
      <div className="col-span-2 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(96px,1fr))] divide-x divide-border/70 md:col-span-1">
        {conditionValues.map((value) => (
          <div
            key={value.condition}
            className="flex min-w-0 flex-col items-center justify-center px-2 py-1 text-center"
          >
            <span className="max-w-full truncate text-[10px] font-semibold uppercase text-muted">
              {value.label}
            </span>
            <strong className="mt-0.5 text-sm font-bold text-accent tabular-nums">
              {value.totalPrice == null
                ? "Pendiente"
                : `${formatEur(value.totalPrice)}${value.units > 1 ? " total" : ""}`}
            </strong>
            <span className="mt-0.5 text-[10px] text-muted tabular-nums">
              {value.units === 1
                ? "1 unidad"
                : value.unitPrice == null
                  ? `${value.units} unidades`
                  : `${value.units} uds. × ${formatEur(value.unitPrice)}`}
            </span>
          </div>
        ))}
      </div>
      <LinkPendingFeedback label="Abriendo ficha…" overlay />
    </IntentLink>
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
  const color = locked ? "text-muted" : accent === "rose" ? "text-rose-700 dark:text-rose-300" : "text-accent";
  return (
    <article className="rounded-2xl border border-border bg-gradient-to-br from-white/[0.05] to-transparent p-5">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </article>
  );
}

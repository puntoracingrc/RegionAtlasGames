"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogGameCard } from "@/components/game-card";
import { CatalogPagination } from "@/components/catalog-pagination";
import { HighlightLegend } from "@/components/highlight-legend";
import { PriceLegend } from "@/components/price-legend";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  countByPriceFilter,
  filterCatalogGames,
  platformOptions,
  PRICE_FILTER_OPTIONS,
  regionOptions,
  SORT_OPTIONS,
  type CatalogPriceFilter,
  type CatalogSort,
} from "@/lib/catalog-filters";
import { getRegionDisplay } from "@/lib/region-display";
import type { CatalogGame } from "@/lib/types";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { cn } from "@/lib/cn";

const selectClass =
  "rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none ring-accent/25 focus:ring-2";

type Props = {
  games: CatalogGame[];
  contextName: string;
  showRegionFilter?: boolean;
  showPlatformFilter?: boolean;
  ownedCatalogIds?: string[];
  listingCounts?: Record<string, number>;
  isLoggedIn?: boolean;
  compactLegends?: boolean;
};

export function CatalogBrowser({
  games,
  contextName,
  showRegionFilter = true,
  showPlatformFilter = false,
  ownedCatalogIds = [],
  listingCounts = {},
  isLoggedIn = false,
  compactLegends = false,
}: Props) {
  const gridRef = useRef<HTMLElement>(null);
  const [ownedIds, setOwnedIds] = useState(ownedCatalogIds);
  const ownedSet = useMemo(() => new Set(ownedIds), [ownedIds]);

  useEffect(() => {
    setOwnedIds(ownedCatalogIds);
  }, [ownedCatalogIds]);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [sort, setSort] = useState<CatalogSort>(DEFAULT_SORT);
  const [priceFilter, setPriceFilter] = useState<CatalogPriceFilter>("all");
  const [page, setPage] = useState(1);

  const regions = useMemo(() => regionOptions(games), [games]);
  const platforms = useMemo(() => platformOptions(games), [games]);
  const priceCounts = useMemo(() => countByPriceFilter(games), [games]);

  const { items: filteredItems, total } = useMemo(
    () =>
      filterCatalogGames(
        games,
        { q, region, platform, sort, priceFilter },
        {
          regions: showRegionFilter,
          platforms: showPlatformFilter,
        },
      ),
    [games, q, region, platform, sort, priceFilter, showRegionFilter, showPlatformFilter],
  );

  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [q, region, platform, sort, priceFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * CATALOG_PAGE_SIZE;
    return filteredItems.slice(start, start + CATALOG_PAGE_SIZE);
  }, [filteredItems, safePage]);

  const hasActiveFilters =
    q.trim() !== "" ||
    region !== "all" ||
    platform !== "all" ||
    priceFilter !== "all" ||
    sort !== DEFAULT_SORT;

  const resultStart = total === 0 ? 0 : (safePage - 1) * CATALOG_PAGE_SIZE + 1;
  const resultEnd = Math.min(safePage * CATALOG_PAGE_SIZE, total);

  function goToPage(nextPage: number) {
    setPage(nextPage);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleOwnedChange(catalogId: string, owned: boolean) {
    setOwnedIds((prev) =>
      owned ? [...new Set([...prev, catalogId])] : prev.filter((id) => id !== catalogId),
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <input
          type="search"
          placeholder="Nombre, compañía, género, referencia, SKU, región…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm outline-none ring-accent/25 placeholder:text-muted focus:ring-2"
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {showRegionFilter && regions.length > 1 && (
            <select value={region} onChange={(e) => setRegion(e.target.value)} className={selectClass}>
              <option value="all">Todas las regiones ({games.length})</option>
              {regions.map(([label, count]) => {
                const { shortLabel } = getRegionDisplay(label);
                return (
                  <option key={label} value={label}>
                    {shortLabel} · {label} ({count})
                  </option>
                );
              })}
            </select>
          )}

          {showPlatformFilter && platforms.length > 1 && (
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={selectClass}>
              <option value="all">Todas las plataformas ({games.length})</option>
              {platforms.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name} ({p.count})
                </option>
              ))}
            </select>
          )}

          <select
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value as CatalogPriceFilter)}
            className={cn(selectClass, "sm:min-w-[220px]")}
          >
            {PRICE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({priceCounts[opt.value].toLocaleString("es-ES")})
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as CatalogSort)}
            className={cn(selectClass, "sm:min-w-[220px]")}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {total === 0 ? (
              <>0 resultados en {contextName}</>
            ) : totalPages > 1 ? (
              <>
                Mostrando {resultStart.toLocaleString("es-ES")}–{resultEnd.toLocaleString("es-ES")} de{" "}
                {total.toLocaleString("es-ES")} en {contextName}
              </>
            ) : (
              <>
                {total.toLocaleString("es-ES")} resultado{total !== 1 ? "s" : ""} en {contextName}
              </>
            )}
            {ownedIds.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                · {ownedIds.length} en colección
              </span>
            )}
          </p>
          <HighlightLegend showOwned compact={compactLegends} />
        </div>
        <PriceLegend defaultOpen={!compactLegends} />
      </div>

      {pageItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted">
          Ningún juego coincide. Prueba otro término, compañía o referencia.
        </div>
      ) : (
        <>
          {totalPages > 1 && (
            <CatalogPagination
              page={safePage}
              pageSize={CATALOG_PAGE_SIZE}
              total={total}
              onPageChange={goToPage}
            />
          )}

          <section ref={gridRef} className={CATALOG_GRID_CLASS}>
            {pageItems.map((game) => (
            <CatalogGameCard
              key={game.id}
              game={game}
              owned={ownedSet.has(game.id)}
              isLoggedIn={isLoggedIn}
              onOwnedChange={handleOwnedChange}
              listingsForSale={listingCounts[game.id] ?? 0}
            />
            ))}
          </section>

          {totalPages > 1 && (
            <CatalogPagination
              page={safePage}
              pageSize={CATALOG_PAGE_SIZE}
              total={total}
              onPageChange={goToPage}
            />
          )}
        </>
      )}

      {hasActiveFilters && pageItems.length > 0 && (
        <p className="text-center text-[11px] text-muted">
          Búsqueda en título, desarrolladora, publicadora, género, referencia, soporte, saga y región.
        </p>
      )}
    </div>
  );
}

/** @deprecated usar CatalogBrowser con props explícitas */
export function EntityBrowser({
  games,
  title,
  ownedCatalogIds = [],
  listingCounts = {},
  isLoggedIn = false,
}: {
  games: CatalogGame[];
  title: string;
  ownedCatalogIds?: string[];
  listingCounts?: Record<string, number>;
  isLoggedIn?: boolean;
}) {
  return (
    <CatalogBrowser
      games={games}
      contextName={title}
      showRegionFilter={false}
      showPlatformFilter
      ownedCatalogIds={ownedCatalogIds}
      listingCounts={listingCounts}
      isLoggedIn={isLoggedIn}
    />
  );
}

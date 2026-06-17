"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CatalogGameCard } from "@/components/game-card";
import { CatalogPagination } from "@/components/catalog-pagination";
import { HighlightLegend } from "@/components/highlight-legend";
import { PriceLegend } from "@/components/price-legend";
import { RegionFilterChips } from "@/components/region-filter-chips";
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
import type { CatalogListGame } from "@/lib/types";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { cn } from "@/lib/cn";

const selectClass =
  "rounded-lg border border-border bg-input px-3 py-2 text-sm outline-none ring-accent/25 focus:ring-2";

type Props = {
  games: CatalogListGame[];
  contextName: string;
  source?: { kind: "platform"; slug: string };
  totalCount?: number;
  regions?: ReturnType<typeof regionOptions>;
  platforms?: ReturnType<typeof platformOptions>;
  priceCounts?: ReturnType<typeof countByPriceFilter>;
  showRegionFilter?: boolean;
  showPlatformFilter?: boolean;
  ownedCatalogIds?: string[];
  listingCounts?: Record<string, number>;
  isLoggedIn?: boolean;
  compactLegends?: boolean;
  /** Filtro de región controlado (p. ej. desde la barra del hero) */
  region?: string;
  onRegionChange?: (region: string) => void;
};

export function CatalogBrowser({
  games,
  contextName,
  source,
  totalCount,
  regions: initialRegions,
  platforms: initialPlatforms,
  priceCounts: initialPriceCounts,
  showRegionFilter = true,
  showPlatformFilter = false,
  ownedCatalogIds = [],
  listingCounts = {},
  isLoggedIn = false,
  compactLegends = false,
  region: controlledRegion,
  onRegionChange,
}: Props) {
  const gridRef = useRef<HTMLElement>(null);
  const [ownedIds, setOwnedIds] = useState(ownedCatalogIds);
  const ownedSet = useMemo(() => new Set(ownedIds), [ownedIds]);

  useEffect(() => {
    setOwnedIds(ownedCatalogIds);
  }, [ownedCatalogIds]);
  const [draftQ, setDraftQ] = useState("");
  const [q, setQ] = useState("");
  const [internalRegion, setInternalRegion] = useState("all");
  const region = controlledRegion ?? internalRegion;
  const setRegion = onRegionChange ?? setInternalRegion;
  const [platform, setPlatform] = useState("all");
  const [sort, setSort] = useState<CatalogSort>(DEFAULT_SORT);
  const [priceFilter, setPriceFilter] = useState<CatalogPriceFilter>("all");
  const [page, setPage] = useState(1);
  const [serverItems, setServerItems] = useState(games);
  const [serverTotal, setServerTotal] = useState(totalCount ?? games.length);
  const [isLoading, setIsLoading] = useState(false);

  const regions = useMemo(() => initialRegions ?? regionOptions(games), [games, initialRegions]);
  const platforms = useMemo(() => initialPlatforms ?? platformOptions(games), [games, initialPlatforms]);
  const priceCounts = useMemo(
    () => initialPriceCounts ?? countByPriceFilter(games),
    [games, initialPriceCounts],
  );

  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        const trimmed = draftQ.trim();
        setQ(trimmed.length === 1 ? "" : draftQ);
      },
      draftQ.trim() ? 320 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [draftQ]);

  const localResult = useMemo(() => {
    if (source) return { items: serverItems, total: serverTotal };
    return filterCatalogGames(
      games,
      { q, region, platform, sort, priceFilter },
      {
        regions: showRegionFilter,
        platforms: showPlatformFilter,
      },
    );
  }, [games, priceFilter, platform, q, region, serverItems, serverTotal, showPlatformFilter, showRegionFilter, sort, source]);
  const filteredItems = source ? serverItems : localResult.items;
  const total = source ? serverTotal : localResult.total;

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

  useEffect(() => {
    if (!source) return;

    const defaultServerView =
      q.trim() === "" &&
      region === "all" &&
      sort === DEFAULT_SORT &&
      priceFilter === "all" &&
      page === 1;

    if (defaultServerView) {
      setServerItems(games);
      setServerTotal(totalCount ?? games.length);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          q,
          region,
          sort,
          priceFilter,
          page: String(page),
        });
        const response = await fetch(`/api/catalog/platform/${encodeURIComponent(source.slug)}?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          items: CatalogListGame[];
          total: number;
        };
        setServerItems(payload.items);
        setServerTotal(payload.total);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[catalog-browser] fetch failed", error);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, q.trim() ? 220 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [games, page, priceFilter, q, region, sort, source, totalCount]);

  const pageItems = useMemo(() => {
    if (source) return filteredItems;
    const start = (safePage - 1) * CATALOG_PAGE_SIZE;
    return filteredItems.slice(start, start + CATALOG_PAGE_SIZE);
  }, [filteredItems, safePage, source]);

  const hasActiveFilters =
    draftQ.trim() !== "" ||
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

  const handleOwnedChange = useCallback(function handleOwnedChange(
    catalogId: string,
    owned: boolean,
    ownedCatalogIds?: string[],
  ) {
    if (ownedCatalogIds) {
      setOwnedIds(ownedCatalogIds);
      return;
    }
    setOwnedIds((prev) =>
      owned ? [...new Set([...prev, catalogId])] : prev.filter((id) => id !== catalogId),
    );
  }, []);

  const catalogGrid = useMemo(
    () => (
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
    ),
    [handleOwnedChange, isLoggedIn, listingCounts, ownedSet, pageItems],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <input
          type="search"
          placeholder="Nombre, compañía, género, referencia, SKU, región…"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-lg border border-border bg-input px-3.5 py-2.5 text-sm outline-none ring-accent/25 placeholder:text-muted focus:ring-2"
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {showRegionFilter && regions.length > 1 && (
            <RegionFilterChips
              value={region}
              onChange={setRegion}
              allLabel="Todas las regiones"
              options={regions.map(([label, count]) => ({
                value: label,
                label,
                count,
              }))}
              className="w-full sm:flex-1"
            />
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
          {(isLoading || draftQ !== q) && <p className="text-xs text-accent">Actualizando catálogo…</p>}
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

          {catalogGrid}

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
  games: CatalogListGame[];
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

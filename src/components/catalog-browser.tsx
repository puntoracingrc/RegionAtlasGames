"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LayoutGrid, LoaderCircle, Rows3, ShoppingCart } from "lucide-react";
import { CatalogGameCard } from "@/components/game-card";
import { CatalogPagination } from "@/components/catalog-pagination";
import { CollectionQuickAdd } from "@/components/collection-quick-add";
import { HighlightLegend } from "@/components/highlight-legend";
import { IntentLink } from "@/components/intent-link";
import { LinkPendingFeedback } from "@/components/link-pending-feedback";
import { PriceLegend } from "@/components/price-legend";
import { RegionFlag } from "@/components/region-flag";
import { RegionFilterChips } from "@/components/region-filter-chips";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  PRICE_TYPE_OPTIONS,
  catalogPriceTypeOptions,
  normalizeCatalogPriceTypeForPlatform,
  filterCatalogGames,
  platformOptions,
  publicFacetFilterOptions,
  publicGenreFilterOptions,
  publicRegionFilterOptions,
  publicSubgenreFilterOptions,
  regionOptions,
  SORT_OPTIONS,
  type CatalogCompanyFilterOption,
  type CatalogPlatformFilterOption,
  type CatalogPriceType,
  type CatalogRegionFilterOption,
  type CatalogSort,
  type CatalogTaxonomyFilterOption,
} from "@/lib/catalog-filters";
import type { CatalogListGame } from "@/lib/types";
import { catalogGamePath } from "@/lib/catalog-path";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { catalogConditionPriceRows } from "@/lib/price-display";
import { formatEur } from "@/lib/price-format";
import { cn } from "@/lib/cn";

const selectClass =
  "h-10 w-full rounded-lg border border-border bg-input px-3 text-sm outline-none ring-accent/25 transition focus:border-accent/50 focus:ring-2";

function filterOptionLabel(label: string, _count?: number): string {
  return label;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="min-w-0 space-y-1">
      <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-muted">{label}</span>
      {children}
    </label>
  );
}

function CatalogCompactRow({
  game,
  owned,
  isLoggedIn,
  onOwnedChange,
  listingsForSale,
}: {
  game: CatalogListGame;
  owned: boolean;
  isLoggedIn: boolean;
  onOwnedChange: (catalogId: string, owned: boolean, ownedCatalogIds?: string[]) => void;
  listingsForSale: number;
}) {
  const cover = getCoverSrc(game.coverUrl, game.id);
  const conditionPrices = catalogConditionPriceRows(game);

  return (
    <div
      className={cn(
        "relative flex min-h-[68px] items-center transition [content-visibility:auto] hover:bg-card-hover",
        owned && "bg-emerald-500/[0.06]",
      )}
      data-catalog-list-row={game.id}
    >
      <IntentLink
        href={catalogGamePath(game)}
        className="group grid min-w-0 flex-1 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 px-1 py-2 sm:grid-cols-[48px_minmax(0,1fr)_minmax(110px,auto)_minmax(120px,auto)] sm:px-2"
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
            <span>{game.displayPlatform}</span>
            <span aria-hidden>·</span>
            <RegionFlag region={game.region} size="xs" showLabel labelMode="short" />
            {game.displayYear != null ? (
              <>
                <span aria-hidden>·</span>
                <span>{game.displayYear}</span>
              </>
            ) : null}
            {owned ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">En tu colección</span>
              </>
            ) : null}
          </p>
          {listingsForSale > 0 ? (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-600 sm:hidden dark:text-emerald-400">
              <ShoppingCart className="h-3 w-3" aria-hidden />
              {listingsForSale} {listingsForSale === 1 ? "anuncio" : "anuncios"}
            </p>
          ) : null}
        </div>

        <p className="hidden items-center justify-end gap-1 text-right text-[11px] text-muted sm:flex">
          {listingsForSale > 0 ? (
            <>
              <ShoppingCart className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
              <span>{listingsForSale} en venta</span>
            </>
          ) : (
            <span aria-hidden>—</span>
          )}
        </p>

        <dl
          className="grid w-[92px] shrink-0 grid-rows-3 gap-0.5 text-[9px] leading-tight sm:w-[138px] sm:text-[10px]"
          aria-label="Precios por estado"
        >
          {conditionPrices.map((value) => (
            <div
              key={value.condition}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1"
            >
              <dt className="truncate text-muted">{value.label}</dt>
              <dd
                className={cn(
                  "whitespace-nowrap text-right font-semibold tabular-nums",
                  value.price == null ? "text-muted" : "text-accent",
                )}
              >
                {value.price == null ? "--" : formatEur(value.price)}
              </dd>
            </div>
          ))}
        </dl>
        <LinkPendingFeedback label="Abriendo ficha…" overlay />
      </IntentLink>

      <CollectionQuickAdd
        catalogId={game.id}
        owned={owned}
        isLoggedIn={isLoggedIn}
        onChange={onOwnedChange}
        className="relative mr-2 shrink-0"
      />
    </div>
  );
}

type Props = {
  games: CatalogListGame[];
  contextName: string;
  source?:
    | { kind: "platform"; slug: string }
    | { kind: "catalog" }
    | { kind: "genre"; slug: string }
    | { kind: "taxonomy"; filter: "genre" | "subgenre" | "facet"; slug: string };
  totalCount?: number;
  regions?: CatalogRegionFilterOption[];
  regionsByPlatform?: Record<string, CatalogRegionFilterOption[]>;
  platforms?: CatalogPlatformFilterOption[];
  genres?: CatalogTaxonomyFilterOption[];
  subgenres?: CatalogTaxonomyFilterOption[];
  facets?: CatalogTaxonomyFilterOption[];
  companies?: CatalogCompanyFilterOption[];
  showRegionFilter?: boolean;
  showPlatformFilter?: boolean;
  showTaxonomyFilters?: boolean;
  ownedCatalogIds?: string[];
  listingCounts?: Record<string, number>;
  isLoggedIn?: boolean;
  compactLegends?: boolean;
  showPriceLegend?: boolean;
  persistKey?: string;
  initialQuery?: string;
  initialRegion?: string;
  initialPlatform?: string;
  initialGenre?: string;
  initialSubgenre?: string;
  initialFacet?: string;
  initialPriceType?: CatalogPriceType;
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
  regionsByPlatform,
  platforms: initialPlatforms,
  genres: initialGenres,
  subgenres: initialSubgenres,
  facets: initialFacets,
  companies: initialCompanies,
  showRegionFilter = true,
  showPlatformFilter = false,
  showTaxonomyFilters = false,
  ownedCatalogIds = [],
  listingCounts = {},
  isLoggedIn = false,
  compactLegends = false,
  showPriceLegend = true,
  persistKey,
  initialQuery = "",
  initialRegion = "all",
  initialPlatform = "all",
  initialGenre = "all",
  initialSubgenre = "all",
  initialFacet = "all",
  initialPriceType = "recommended",
  region: controlledRegion,
  onRegionChange,
}: Props) {
  const gridRef = useRef<HTMLElement>(null);
  const skipNextResetRef = useRef(false);
  const [ownedIds, setOwnedIds] = useState(ownedCatalogIds);
  const ownedSet = useMemo(() => new Set(ownedIds), [ownedIds]);

  useEffect(() => {
    setOwnedIds(ownedCatalogIds);
  }, [ownedCatalogIds]);
  const [draftQ, setDraftQ] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery.trim().length === 1 ? "" : initialQuery);
  const [internalRegion, setInternalRegion] = useState(initialRegion);
  const region = controlledRegion ?? internalRegion;
  const setRegion = onRegionChange ?? setInternalRegion;
  const [platform, setPlatform] = useState(initialPlatform);
  const [genre, setGenre] = useState(initialGenre);
  const [subgenre, setSubgenre] = useState(initialSubgenre);
  const [facet, setFacet] = useState(initialFacet);
  const [company, setCompany] = useState("");
  const [companyFocused, setCompanyFocused] = useState(false);
  const [selectedPriceType, setSelectedPriceType] = useState<CatalogPriceType>(initialPriceType);
  const [sort, setSort] = useState<CatalogSort>(initialPriceType === "recommended" ? DEFAULT_SORT : "price-desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const priceFilter = "all";
  const [page, setPage] = useState(1);
  const [serverItems, setServerItems] = useState(games);
  const [serverTotal, setServerTotal] = useState(totalCount ?? games.length);
  const [isLoading, setIsLoading] = useState(false);
  const canShowPriceLegend = showPriceLegend && source?.kind !== "platform";
  const [savedStateLoaded, setSavedStateLoaded] = useState(!persistKey);
  const normalizedDraftLength = draftQ.trim().length;
  const searchSettling =
    draftQ !== q && (normalizedDraftLength === 0 || normalizedDraftLength >= 2);
  const catalogBusy = isLoading || searchSettling;

  const regions = useMemo(
    () =>
      initialRegions ??
      regionOptions(games).map(([label, count]) => ({ value: label, label, count })),
    [games, initialRegions],
  );
  const platforms = useMemo(() => initialPlatforms ?? platformOptions(games), [games, initialPlatforms]);
  const genres = useMemo(() => initialGenres ?? publicGenreFilterOptions(), [initialGenres]);
  const subgenres = useMemo(() => initialSubgenres ?? publicSubgenreFilterOptions(), [initialSubgenres]);
  const facets = useMemo(() => initialFacets ?? publicFacetFilterOptions(), [initialFacets]);
  const companies = useMemo(() => initialCompanies ?? [], [initialCompanies]);
  const [activeRegions, setActiveRegions] = useState(regions);
  const [activeGenres, setActiveGenres] = useState(genres);
  const [activeSubgenres, setActiveSubgenres] = useState(subgenres);
  const [activeFacets, setActiveFacets] = useState(facets);
  const [activeCompanies, setActiveCompanies] = useState(companies);
  const priceTypePlatform = source?.kind === "platform"
    ? source.slug
    : platform !== "all"
      ? platform
      : null;
  const priceTypeOptions = useMemo(
    () => catalogPriceTypeOptions(priceTypePlatform),
    [priceTypePlatform],
  );
  const priceType = normalizeCatalogPriceTypeForPlatform(
    selectedPriceType,
    priceTypePlatform,
  );

  const visibleRegions = useMemo(() => {
    if (showPlatformFilter && platform !== "all") {
      return regionsByPlatform?.[platform] ?? [];
    }
    return activeRegions;
  }, [activeRegions, platform, regionsByPlatform, showPlatformFilter]);

  useEffect(() => {
    setActiveRegions(regions);
    setActiveGenres(genres);
    setActiveSubgenres(subgenres);
    setActiveFacets(facets);
    setActiveCompanies(companies);
  }, [companies, facets, genres, regions, subgenres]);

  useEffect(() => {
    if (region === "all") return;
    if (visibleRegions.some((option) => option.value === region)) return;
    setRegion("all");
  }, [region, setRegion, visibleRegions]);

  useEffect(() => {
    if (!persistKey) return;
    try {
      const raw = window.localStorage.getItem(persistKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          q?: string;
          region?: string;
          platform?: string;
          genre?: string;
          subgenre?: string;
          facet?: string;
          company?: string;
          priceType?: CatalogPriceType;
          sort?: CatalogSort;
          page?: number;
        };
        skipNextResetRef.current = true;
        if (typeof saved.q === "string") {
          setDraftQ(saved.q);
          setQ(saved.q.trim().length === 1 ? "" : saved.q);
        }
        if (typeof saved.region === "string") setRegion(saved.region);
        if (typeof saved.platform === "string") setPlatform(saved.platform);
        if (typeof saved.genre === "string") setGenre(saved.genre);
        if (typeof saved.subgenre === "string") setSubgenre(saved.subgenre);
        if (typeof saved.facet === "string") setFacet(saved.facet);
        if (typeof saved.company === "string") setCompany(saved.company);
        if (saved.priceType && PRICE_TYPE_OPTIONS.some((option) => option.value === saved.priceType)) setSelectedPriceType(saved.priceType);
        if (saved.sort && SORT_OPTIONS.some((option) => option.value === saved.sort)) setSort(saved.sort);
        if (typeof saved.page === "number" && Number.isFinite(saved.page)) setPage(Math.max(1, saved.page));
      }
    } catch (error) {
      console.warn("[catalog-browser] saved filters ignored", error);
    } finally {
      setSavedStateLoaded(true);
    }
  }, [persistKey, setRegion]);

  useEffect(() => {
    if (!persistKey || !savedStateLoaded) return;
    window.localStorage.setItem(
      persistKey,
      JSON.stringify({ q: draftQ, region, platform, genre, subgenre, facet, company, priceType, sort, page }),
    );
  }, [company, draftQ, facet, genre, page, persistKey, platform, priceType, region, savedStateLoaded, sort, subgenre]);

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
      { q, region, platform, sort, priceType, priceFilter, genre, subgenre, facet, company, queryScope: "full" },
      {
        regions: showRegionFilter,
        platforms: showPlatformFilter,
      },
    );
  }, [company, facet, games, genre, platform, priceType, q, region, serverItems, serverTotal, showPlatformFilter, showRegionFilter, sort, source, subgenre]);
  const filteredItems = source ? serverItems : localResult.items;
  const total = source ? serverTotal : localResult.total;

  const totalPages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (!savedStateLoaded) return;
    if (skipNextResetRef.current) {
      skipNextResetRef.current = false;
      return;
    }
    setPage(1);
  }, [company, q, region, platform, priceType, sort, genre, subgenre, facet, savedStateLoaded]);

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
      genre === "all" &&
      subgenre === "all" &&
      facet === "all" &&
      company.trim() === "" &&
      priceType === "recommended" &&
      sort === DEFAULT_SORT &&
      page === 1 &&
      (source.kind === "platform" || platform === "all");

    if (defaultServerView) {
      setServerItems(games);
      setServerTotal(totalCount ?? games.length);
      setActiveRegions(regions);
      setActiveGenres(genres);
      setActiveSubgenres(subgenres);
      setActiveFacets(facets);
      setActiveCompanies(companies);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q,
          region,
          sort,
          priceType,
          priceFilter: "all",
          page: String(page),
        });
        if (company.trim()) params.set("company", company.trim());
        if (source.kind === "catalog" || source.kind === "genre" || source.kind === "taxonomy") {
          params.set("platform", platform);
          params.set("mode", "browser");
        }
        if (source.kind === "genre") {
          params.set("genre", source.slug);
        }
        if (source.kind === "taxonomy") {
          params.set(source.filter, source.slug);
        }
        if (genre !== "all") params.set("genre", genre);
        if (subgenre !== "all") params.set("subgenre", subgenre);
        if (facet !== "all") params.set("facet", facet);
        const endpoint =
          source.kind === "platform"
            ? `/api/catalog/platform/${encodeURIComponent(source.slug)}?${params}`
            : `/api/catalog/search?${params}`;
        const response = await fetch(endpoint, { signal: controller.signal });
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
  }, [companies, company, facet, facets, games, genre, genres, page, platform, priceType, q, region, regions, sort, source, subgenre, subgenres, totalCount]);

  const pageItems = useMemo(() => {
    if (source) return filteredItems;
    const start = (safePage - 1) * CATALOG_PAGE_SIZE;
    return filteredItems.slice(start, start + CATALOG_PAGE_SIZE);
  }, [filteredItems, safePage, source]);

  const hasActiveFilters =
    draftQ.trim() !== "" ||
    region !== "all" ||
    platform !== "all" ||
    company.trim() !== "" ||
    genre !== "all" ||
    subgenre !== "all" ||
    facet !== "all" ||
    priceType !== "recommended" ||
    sort !== DEFAULT_SORT;

  const companySuggestions = useMemo(() => {
    const needle = company.trim().toLowerCase();
    if (!needle) return activeCompanies.slice(0, 8);
    return activeCompanies
      .filter((option) => option.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [activeCompanies, company]);

  const resultStart = total === 0 ? 0 : (safePage - 1) * CATALOG_PAGE_SIZE + 1;
  const resultEnd = Math.min(safePage * CATALOG_PAGE_SIZE, total);

  function goToPage(nextPage: number) {
    setIsLoading(true);
    setPage(nextPage);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePriceTypeChange(nextPriceType: CatalogPriceType) {
    setSelectedPriceType(nextPriceType);
    if (nextPriceType !== "recommended" && sort !== "price-asc" && sort !== "price-desc") {
      setSort("price-desc");
    }
  }

  function handlePlatformChange(nextPlatform: string) {
    const nextPriceType = normalizeCatalogPriceTypeForPlatform(priceType, nextPlatform);
    setPlatform(nextPlatform);
    setSelectedPriceType(nextPriceType);
    if (nextPriceType !== priceType) setSort(DEFAULT_SORT);
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

  const catalogList = useMemo(
    () => (
      <section ref={gridRef} className="divide-y divide-border/70 border-y border-border/70">
        {pageItems.map((game) => (
          <CatalogCompactRow
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
      <div className="rounded-3xl border border-border/80 bg-card/95 p-4 shadow-sm shadow-black/5 backdrop-blur md:p-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-accent">
              Buscar y filtrar
            </p>
            <h3 className="mt-1 text-lg font-black text-foreground">Explorar catálogo</h3>
          </div>
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "flex min-h-6 items-center gap-2 text-xs font-semibold text-accent transition-opacity",
              catalogBusy ? "opacity-100" : "opacity-0",
            )}
          >
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
            Actualizando catálogo…
          </div>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-muted">Buscador</span>
            <input
              type="search"
              placeholder="Nombre del juego, referencia o SKU…"
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-12 w-full rounded-2xl border border-border bg-input px-4 text-sm shadow-sm outline-none ring-accent/25 transition placeholder:text-muted focus:border-accent/50 focus:ring-2"
            />
          </label>

          <div className="space-y-3">
            {showRegionFilter && visibleRegions.length > 1 && (
              <div className="rounded-2xl border border-border/70 bg-background/55 p-2">
                <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">Región</p>
                <RegionFilterChips
                  value={region}
                  onChange={setRegion}
                  allLabel="Todas las regiones"
                  options={visibleRegions}
                  className="gap-1.5"
                />
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
            {showPlatformFilter && platforms.length > 1 && (
              <FilterField label="Plataforma">
                <select value={platform} onChange={(e) => handlePlatformChange(e.target.value)} className={selectClass}>
                  <option value="all">Todas las plataformas</option>
                  {platforms.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {filterOptionLabel(p.name, p.count)}
                    </option>
                  ))}
                </select>
              </FilterField>
            )}

            {showTaxonomyFilters && activeGenres.length > 1 && (
              <FilterField label="Género">
                <select value={genre} onChange={(e) => setGenre(e.target.value)} className={selectClass}>
                  <option value="all">Todos los géneros</option>
                  {activeGenres.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {filterOptionLabel(option.name, option.count)}
                    </option>
                  ))}
                </select>
              </FilterField>
            )}

            {showTaxonomyFilters && activeSubgenres.length > 1 && (
              <FilterField label="Subgénero">
                <select value={subgenre} onChange={(e) => setSubgenre(e.target.value)} className={selectClass}>
                  <option value="all">Todos los subgéneros</option>
                  {activeSubgenres.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {filterOptionLabel(option.name, option.count)}
                    </option>
                  ))}
                </select>
              </FilterField>
            )}

            {showTaxonomyFilters && activeFacets.length > 1 && (
              <FilterField label="Faceta">
                <select value={facet} onChange={(e) => setFacet(e.target.value)} className={selectClass}>
                  <option value="all">Todas las facetas</option>
                  {activeFacets.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {filterOptionLabel(option.name, option.count)}
                    </option>
                  ))}
                </select>
              </FilterField>
            )}

            {showTaxonomyFilters && (
              <FilterField label="Compañía">
                <div className="relative">
                  <input
                    type="search"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    onFocus={() => setCompanyFocused(true)}
                    onBlur={() => window.setTimeout(() => setCompanyFocused(false), 120)}
                    placeholder="Filtrar por compañía…"
                    className={selectClass}
                  />
                  {companyFocused && companySuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-card p-1 shadow-xl">
                      {companySuggestions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setCompany(option.name)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-card-hover"
                        >
                          <span className="truncate font-medium text-foreground">{option.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FilterField>
            )}

            <FilterField label="Estado">
              <select
                value={priceType}
                onChange={(e) => handlePriceTypeChange(e.target.value as CatalogPriceType)}
                className={selectClass}
              >
                {priceTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Orden">
              <select value={sort} onChange={(e) => setSort(e.target.value as CatalogSort)} className={selectClass}>
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FilterField>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/55 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-muted">
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
            </p>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <HighlightLegend showOwned compact={compactLegends} />
              <div className="inline-flex rounded-lg border border-border bg-input p-0.5" aria-label="Vista del catálogo">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Ver como cuadrícula"
                  aria-pressed={viewMode === "grid"}
                  title="Cuadrícula"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md transition",
                    viewMode === "grid"
                      ? "bg-card-hover text-accent shadow-sm"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="Ver como lista compacta"
                  aria-pressed={viewMode === "list"}
                  title="Lista compacta"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md transition",
                    viewMode === "list"
                      ? "bg-card-hover text-accent shadow-sm"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <Rows3 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>
          {canShowPriceLegend && <PriceLegend defaultOpen={!compactLegends} />}
        </div>
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
              disabled={catalogBusy}
            />
          )}

          <div className="relative" aria-busy={catalogBusy}>
            <div className={cn("transition duration-200", catalogBusy && "pointer-events-none opacity-35")}>
              {viewMode === "grid" ? catalogGrid : catalogList}
            </div>
            {catalogBusy ? (
              <div className="pointer-events-none absolute inset-x-0 top-6 z-30 flex justify-center px-4">
                <div className="flex items-center gap-3 rounded-lg border border-accent/35 bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-xl">
                  <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-accent" />
                  Actualizando resultados…
                </div>
              </div>
            ) : null}
          </div>

          {totalPages > 1 && (
            <CatalogPagination
              page={safePage}
              pageSize={CATALOG_PAGE_SIZE}
              total={total}
              onPageChange={goToPage}
              disabled={catalogBusy}
            />
          )}
        </>
      )}

      {hasActiveFilters && pageItems.length > 0 && (
        <p className="text-center text-[11px] text-muted">
          Búsqueda escrita limitada a juego/referencia/SKU. Compañía, género, subgénero, faceta y región van por filtros.
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
  showPriceLegend = true,
}: {
  games: CatalogListGame[];
  title: string;
  ownedCatalogIds?: string[];
  listingCounts?: Record<string, number>;
  isLoggedIn?: boolean;
  showPriceLegend?: boolean;
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
      showPriceLegend={showPriceLegend}
    />
  );
}

"use client";

import { ChevronDown, ChevronUp, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { formatCatalogEntryCount } from "@/lib/catalog-entry-count";
import { cn } from "@/lib/cn";
import {
  COMPANY_ACTIVITY_OPTIONS,
  COMPANY_MARKET_OPTIONS,
  COMPANY_SIZE_OPTIONS,
  COMPANY_SORT_OPTIONS,
  COMPANY_STATUS_OPTIONS,
  DEFAULT_COMPANY_FILTERS,
  hasActiveCompanyFilters,
  type CompanyCardData,
  type CompanyExplorerData,
  type CompanyIndexFilters,
  type CompanyRoleFilter,
  type CompanyRoleKind,
} from "@/lib/company-explorer-types";

type Props = CompanyExplorerData & {
  totalCount: number;
  initials: string[];
  grouped: {
    publishers: CompanyCardData[];
    developers: CompanyCardData[];
  } | null;
};

const ROLE_TABS: { value: CompanyRoleFilter; label: string; hint: string }[] = [
  { value: "all", label: "Todas", hint: "Catálogo completo" },
  { value: "publishers", label: "Publicadoras", hint: "Compañías con créditos de publicación" },
  { value: "developers", label: "Desarrolladoras", hint: "Compañías con créditos de desarrollo" },
  { value: "both", label: "Ambos roles", hint: "Desarrollan y publican en el catálogo" },
];

const selectClass =
  "w-full rounded-lg border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none ring-accent/30 focus:ring-2";

function companyRoleLabel(role: CompanyRoleKind): string {
  if (role === "publisher") return "Publicadora";
  if (role === "developer") return "Desarrolladora";
  return "Dev + Pub";
}

type CompanyPagePayload = {
  items: CompanyCardData[];
  total: number;
};

function companyPageParams(filters: CompanyIndexFilters, page: number): URLSearchParams {
  return new URLSearchParams({
    q: filters.q,
    initial: filters.initial,
    role: filters.role,
    platform: filters.platform,
    genre: filters.genre,
    size: filters.size,
    status: filters.status,
    activity: filters.activity,
    market: filters.market,
    sort: filters.sort,
    page: String(page),
  });
}

async function fetchCompanyPage(
  filters: CompanyIndexFilters,
  page: number,
  signal?: AbortSignal,
): Promise<CompanyPagePayload> {
  const response = await fetch(`/api/catalog/companies?${companyPageParams(filters, page)}`, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as CompanyPagePayload;
}

export function CompanyExplorer({
  companies: initialCompanies,
  platformOptions,
  genreOptions,
  filterCounts,
  stats,
  totalCount,
  initials,
  grouped,
}: Props) {
  const [filters, setFilters] = useState<CompanyIndexFilters>(DEFAULT_COMPANY_FILTERS);
  const filtersActive = hasActiveCompanyFilters(filters);
  const [items, setItems] = useState(initialCompanies);
  const [total, setTotal] = useState(totalCount);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const showGrouped = !filtersActive;
  const moreFilterCount = [filters.status, filters.activity, filters.market].filter(
    (value) => value !== "all",
  ).length;
  const hasMore = items.length < total;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      if (!filtersActive) {
        setItems(initialCompanies);
        setTotal(totalCount);
        setPage(1);
        setIsLoading(false);
        setLoadError(false);
        return;
      }

      setIsLoading(true);
      setLoadError(false);
      fetchCompanyPage(filters, 1, controller.signal)
        .then((payload) => {
          setItems(payload.items);
          setTotal(payload.total);
          setPage(1);
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            console.warn("[company-explorer] fetch failed", error);
            setLoadError(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, filters.q.trim() ? 180 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, filtersActive, initialCompanies, totalCount]);

  async function loadMore() {
    const nextPage = page + 1;
    setIsLoading(true);
    setLoadError(false);
    try {
      const payload = await fetchCompanyPage(filters, nextPage);
      setItems((current) => [...current, ...payload.items]);
      setTotal(payload.total);
      setPage(nextPage);
    } catch (error) {
      console.warn("[company-explorer] load more failed", error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
        <StatCard label="Compañías" value={stats.total.toLocaleString("es-ES")} hint="Fichas unificadas" />
        <StatCard
          label="Publicadoras"
          value={stats.publishers.toLocaleString("es-ES")}
          hint="Solo publican"
        />
        <StatCard
          label="Desarrolladoras"
          value={stats.developers.toLocaleString("es-ES")}
          hint="Solo desarrollan"
        />
        <StatCard
          label="Perfiles enriquecidos"
          value={stats.withProfile.toLocaleString("es-ES")}
          hint="Historia, logo y SEO"
        />
      </section>

      <div className="flex flex-wrap gap-2">
        {ROLE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            title={tab.hint}
            aria-pressed={filters.role === tab.value}
            onClick={() => setFilters((current) => ({ ...current, role: tab.value }))}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition",
              filters.role === tab.value
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-border bg-card text-foreground/80 hover:border-accent/30 hover:bg-card-hover",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 md:p-5" aria-busy={isLoading}>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            size={18}
          />
          <input
            type="search"
            aria-label="Buscar compañía"
            placeholder="Buscar compañía, alias o slug…"
            value={filters.q}
            onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))}
            className="w-full rounded-lg border border-border bg-input py-2.5 pl-10 pr-4 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted/90 focus:ring-2"
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterField label="Plataforma">
            <select
              value={filters.platform}
              onChange={(e) => setFilters((current) => ({ ...current, platform: e.target.value }))}
              className={selectClass}
            >
              <option value="all">Todas las plataformas</option>
              {platformOptions.map((platform) => (
                <option key={platform.slug} value={platform.slug}>
                  {platform.name} ({platform.companyCount.toLocaleString("es-ES")} compañías)
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Género">
            <select
              value={filters.genre}
              onChange={(e) => setFilters((current) => ({ ...current, genre: e.target.value }))}
              className={selectClass}
            >
              <option value="all">Todos los géneros</option>
              {genreOptions.slice(0, 80).map((genre) => (
                <option key={genre.slug} value={genre.slug}>
                  {genre.name} ({genre.companyCount.toLocaleString("es-ES")} compañías)
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Tamaño del catálogo">
            <select
              value={filters.size}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  size: e.target.value as CompanyIndexFilters["size"],
                }))
              }
              className={selectClass}
            >
              {COMPANY_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Orden">
            <select
              value={filters.sort}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  sort: e.target.value as CompanyIndexFilters["sort"],
                }))
              }
              className={selectClass}
            >
              {COMPANY_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button
            type="button"
            aria-expanded={showMoreFilters}
            aria-controls="company-more-filters"
            onClick={() => setShowMoreFilters((current) => !current)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-input px-3.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-card-hover"
          >
            <SlidersHorizontal aria-hidden="true" size={17} />
            Más filtros
            {moreFilterCount > 0 && (
              <span className="min-w-5 rounded-full bg-accent px-1.5 py-0.5 text-center text-xs text-accent-foreground">
                {moreFilterCount}
              </span>
            )}
            {showMoreFilters ? (
              <ChevronUp aria-hidden="true" size={16} />
            ) : (
              <ChevronDown aria-hidden="true" size={16} />
            )}
          </button>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setFilters(DEFAULT_COMPANY_FILTERS);
                setShowMoreFilters(false);
              }}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-transparent px-3.5 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-card-hover"
            >
              <RotateCcw aria-hidden="true" size={16} />
              Limpiar
            </button>
          )}
        </div>

        {showMoreFilters && (
          <div
            id="company-more-filters"
            className="mt-4 grid gap-3 rounded-lg border border-border bg-background/40 p-3 md:grid-cols-3"
          >
            <FilterField label="Estado de la compañía">
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    status: e.target.value as CompanyIndexFilters["status"],
                  }))
                }
                className={selectClass}
              >
                {COMPANY_STATUS_OPTIONS.filter(
                  (option) => option.value === "all" || filterCounts.status[option.value] > 0,
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.value === "all" ? "" : ` (${filterCounts.status[option.value]})`}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Actividad en catálogo">
              <select
                value={filters.activity}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    activity: e.target.value as CompanyIndexFilters["activity"],
                  }))
                }
                className={selectClass}
              >
                {COMPANY_ACTIVITY_OPTIONS.filter(
                  (option) => option.value === "all" || filterCounts.activity[option.value] > 0,
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.value === "all" ? "" : ` (${filterCounts.activity[option.value]})`}
                  </option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Datos de precio">
              <select
                value={filters.market}
                onChange={(e) =>
                  setFilters((current) => ({
                    ...current,
                    market: e.target.value as CompanyIndexFilters["market"],
                  }))
                }
                className={selectClass}
              >
                {COMPANY_MARKET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FilterField>
          </div>
        )}

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-foreground/85">
            Mostrando <strong className="text-foreground">{items.length.toLocaleString("es-ES")}</strong>{" "}
            de <strong className="text-foreground">{total.toLocaleString("es-ES")}</strong> compañías
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filtrar por inicial">
            <button
              type="button"
              aria-pressed={filters.initial === "all"}
              onClick={() => setFilters((current) => ({ ...current, initial: "all" }))}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                filters.initial === "all"
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-border bg-background/60 text-muted hover:border-accent/30 hover:text-accent",
              )}
            >
              Todas
            </button>
            {initials.map((initial) => (
              <button
                key={initial}
                type="button"
                aria-pressed={filters.initial === initial}
                onClick={() => setFilters((current) => ({ ...current, initial, sort: "name-asc" }))}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                  filters.initial === initial
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-border bg-background/60 text-muted hover:border-accent/30 hover:text-accent",
                )}
              >
                {initial}
              </button>
            ))}
          </div>
        </div>
      </section>

      {showGrouped && grouped && (
        <div className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-2">
            <CompanyPreviewSection title="Publicadoras destacadas" items={grouped.publishers} />
            <CompanyPreviewSection title="Desarrolladoras destacadas" items={grouped.developers} />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Explorar catálogo completo</h2>
        </div>
      )}

      <CompanyGrid companies={items} sort={filters.sort} />

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition hover:border-accent/40 hover:bg-card-hover disabled:cursor-wait disabled:opacity-60"
          >
            {isLoading ? "Cargando…" : "Cargar más compañías"}
          </button>
        </div>
      )}

      {loadError && (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-muted">
          No se pudo cargar la siguiente tanda de compañías.
        </p>
      )}

      {total === 0 && !isLoading && (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted">
          No hay compañías con estos filtros.
        </p>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold uppercase text-muted">{label}</span>
      {children}
    </label>
  );
}

function CompanyPreviewSection({
  title,
  items,
}: {
  title: string;
  items: CompanyExplorerData["companies"];
}) {
  if (items.length === 0) return null;
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((company) => (
          <Link
            key={company.slug}
            href={`/compania/${company.slug}`}
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm transition hover:border-accent/40 hover:bg-card-hover"
          >
            <span className="flex min-w-0 items-center gap-2">
              <CompanyLogo
                name={company.name}
                logoUrl={company.logoUrl}
                provisional={company.logoIsProvisional}
                size="sm"
              />
              <span className="truncate font-semibold text-foreground">{company.name}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-accent">
              {formatCatalogEntryCount(company.catalogEntryCount)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CompanyGrid({
  companies,
  sort,
  compact = false,
}: {
  companies: CompanyExplorerData["companies"];
  sort: CompanyIndexFilters["sort"];
  compact?: boolean;
}) {
  return (
    <section
      className={cn(
        "grid gap-3",
        compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {companies.map((company) => (
        <Link
          key={company.slug}
          href={`/compania/${company.slug}`}
          className="flex min-h-[178px] flex-col rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-card-hover"
        >
          <div className="flex items-start gap-3">
            <CompanyLogo
              name={company.name}
              logoUrl={company.logoUrl}
              provisional={company.logoIsProvisional}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="line-clamp-2 font-semibold leading-snug text-foreground">
                  {company.name}
                </h3>
                <RoleBadge roleKind={company.roleKind} />
              </div>
              <p className="mt-1 text-sm text-accent">
                {company.uniqueWorkCount.toLocaleString("es-ES")} {company.uniqueWorkCount === 1 ? "obra" : "obras"}
                {company.uniqueWorkCount !== company.catalogEntryCount && (
                  <> · {formatCatalogEntryCount(company.catalogEntryCount)}</>
                )}
              </p>
            </div>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted">
            {[
              company.developerCatalogEntryCount > 0
                ? `Desarrollo: ${formatCatalogEntryCount(company.developerCatalogEntryCount)}`
                : null,
              company.publisherCatalogEntryCount > 0
                ? `Publicación: ${formatCatalogEntryCount(company.publisherCatalogEntryCount)}`
                : null,
              company.digitalPublisherCatalogEntryCount > 0
                ? `Edición digital: ${formatCatalogEntryCount(company.digitalPublisherCatalogEntryCount)}`
                : null,
              company.physicalPublisherCatalogEntryCount > 0
                ? `Distribución física: ${formatCatalogEntryCount(company.physicalPublisherCatalogEntryCount)}`
                : null,
            ].filter(Boolean).join(" · ")}
          </p>
          {company.platformPreview && (
            <p className="mt-2 line-clamp-2 text-xs text-muted">{company.platformPreview}</p>
          )}
          <CompanySortMetric company={company} sort={sort} />
          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            {company.hasProfile && (
              <span className="rounded-md border border-border bg-card-hover px-2 py-0.5 text-[10px] uppercase text-muted">
                Perfil
              </span>
            )}
            {company.highValueCatalogEntryCount > 0 && (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
                {formatCatalogEntryCount(company.highValueCatalogEntryCount)} de alto valor
              </span>
            )}
            {company.pricedCatalogEntryCount > 0 && (
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-200">
                {formatCatalogEntryCount(company.pricedCatalogEntryCount)} con precio
              </span>
            )}
          </div>
        </Link>
      ))}
    </section>
  );
}

const euroFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function CompanySortMetric({
  company,
  sort,
}: {
  company: CompanyCardData;
  sort: CompanyIndexFilters["sort"];
}) {
  let label: string | null = null;
  if (sort === "market-desc") {
    label = `Valor acumulado · ${euroFormatter.format(company.marketScore)}`;
  } else if (sort === "median-desc") {
    label = company.medianPrice == null
      ? "Precio mediano sin datos"
      : `Precio mediano · ${euroFormatter.format(company.medianPrice)}`;
  } else if (sort === "grails-desc") {
    label = `${formatCatalogEntryCount(company.highValueCatalogEntryCount)} de alto valor`;
  } else if (sort === "recent-desc") {
    label = company.latestReleaseYear == null
      ? "Actividad sin fecha"
      : `Último lanzamiento · ${company.latestReleaseYear}`;
  }

  if (!label) return null;
  return <p className="mt-2 text-xs font-semibold text-accent">{label}</p>;
}

function RoleBadge({ roleKind }: { roleKind: CompanyExplorerData["companies"][number]["roleKind"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
        roleKind === "publisher" && "bg-sky-500/15 text-sky-700 dark:text-sky-200",
        roleKind === "developer" && "bg-violet-500/15 text-violet-700 dark:text-violet-200",
        roleKind === "both" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200",
      )}
    >
      {companyRoleLabel(roleKind)}
    </span>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="flex min-h-[116px] flex-col rounded-2xl border border-border bg-gradient-to-br from-white/[0.05] to-transparent p-3 md:min-h-[126px] md:p-5">
      <p className="text-[11px] leading-tight uppercase text-muted md:text-xs">{label}</p>
      <p className="mt-2 text-2xl font-bold text-accent md:text-3xl">{value}</p>
      <p className="mt-auto pt-1 text-xs text-muted md:text-sm">{hint}</p>
    </article>
  );
}

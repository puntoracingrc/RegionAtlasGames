"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type CompanyRoleKind = "publisher" | "developer" | "both";
type CompanySort =
  | "name-asc"
  | "name-desc"
  | "games-desc"
  | "games-asc"
  | "market-desc"
  | "dev-desc"
  | "pub-desc";
type CompanyRoleFilter = "all" | "publishers" | "developers" | "both";
type CompanyIndexFilters = {
  q: string;
  initial: string;
  role: CompanyRoleFilter;
  platform: string;
  genre: string;
  sort: CompanySort;
};
type CompanyCardData = {
  slug: string;
  name: string;
  gameCount: number;
  developerCount: number;
  publisherCount: number;
  roleKind: CompanyRoleKind;
  platformSlugs: string[];
  platformPreview: string;
  genreSlugs: string[];
  marketScore: number;
  grailCount: number;
  pricedCount: number;
  hasProfile: boolean;
  searchHaystack: string;
};
type CompanyFilterOption = { slug: string; name: string; count: number };
type CompanyExplorerData = {
  companies: CompanyCardData[];
  platformOptions: CompanyFilterOption[];
  genreOptions: CompanyFilterOption[];
  totalCount: number;
  initials: string[];
  grouped: {
    publishers: CompanyCardData[];
    developers: CompanyCardData[];
  } | null;
  stats: {
    total: number;
    publishers: number;
    developers: number;
    dualRole: number;
    withProfile: number;
    gamesWithDetails: number;
  };
};

const DEFAULT_COMPANY_FILTERS: CompanyIndexFilters = {
  q: "",
  initial: "all",
  role: "all",
  platform: "all",
  genre: "all",
  sort: "games-desc",
};
const COMPANY_SORT_OPTIONS: { value: CompanySort; label: string }[] = [
  { value: "games-desc", label: "Más juegos en catálogo" },
  { value: "games-asc", label: "Menos juegos" },
  { value: "market-desc", label: "Relevancia en mercado" },
  { value: "name-asc", label: "Nombre (A → Z)" },
  { value: "name-desc", label: "Nombre (Z → A)" },
  { value: "dev-desc", label: "Más títulos como desarrolladora" },
  { value: "pub-desc", label: "Más títulos como publicadora" },
];
type Props = CompanyExplorerData;

const ROLE_TABS: { value: CompanyRoleFilter; label: string; hint: string }[] = [
  { value: "all", label: "Todas", hint: "Catálogo completo" },
  { value: "publishers", label: "Publicadoras", hint: "Solo publican (sin créditos de desarrollo)" },
  { value: "developers", label: "Desarrolladoras", hint: "Solo desarrollan (sin créditos de publicación)" },
  { value: "both", label: "Ambos roles", hint: "Desarrollan y publican en el catálogo" },
];

const selectClass =
  "rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 focus:ring-2";

function hasActiveCompanyFilters(filters: CompanyIndexFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.initial !== "all" ||
    filters.role !== "all" ||
    filters.platform !== "all" ||
    filters.genre !== "all" ||
    filters.sort !== DEFAULT_COMPANY_FILTERS.sort
  );
}

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

  const showGrouped =
    filters.role === "all" &&
    !filters.q.trim() &&
    filters.initial === "all" &&
    filters.platform === "all" &&
    filters.genre === "all";
  const hasMore = items.length < total;

  useEffect(() => {
    const controller = new AbortController();

    if (!filtersActive) {
      setItems(initialCompanies);
      setTotal(totalCount);
      setPage(1);
      setIsLoading(false);
      setLoadError(false);
      return () => controller.abort();
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

    return () => controller.abort();
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
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            type="search"
            placeholder="Buscar compañía, alias o slug…"
            value={filters.q}
            onChange={(e) => setFilters((current) => ({ ...current, q: e.target.value }))}
            className="rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 placeholder:text-muted/90 focus:ring-2 xl:col-span-3"
          />
          <select
            value={filters.platform}
            onChange={(e) => setFilters((current) => ({ ...current, platform: e.target.value }))}
            className={selectClass}
          >
            <option value="all">Todas las plataformas</option>
            {platformOptions.map((platform) => (
              <option key={platform.slug} value={platform.slug}>
                {platform.name} ({platform.count})
              </option>
            ))}
          </select>
          <select
            value={filters.genre}
            onChange={(e) => setFilters((current) => ({ ...current, genre: e.target.value }))}
            className={selectClass}
          >
            <option value="all">Todos los géneros</option>
            {genreOptions.slice(0, 80).map((genre) => (
              <option key={genre.slug} value={genre.slug}>
                {genre.name} ({genre.count})
              </option>
            ))}
          </select>
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
          {filtersActive && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_COMPANY_FILTERS)}
              className="rounded-xl border border-border bg-input px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-card-hover"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-foreground/85">
          Mostrando <strong className="text-foreground">{items.length.toLocaleString("es-ES")}</strong>{" "}
          de <strong className="text-foreground">{total.toLocaleString("es-ES")}</strong> compañías
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <button
            type="button"
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

      <CompanyGrid companies={items} />

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

function CompanyPreviewSection({
  title,
  items,
}: {
  title: string;
  items: CompanyExplorerData["companies"];
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((company) => (
          <Link
            key={company.slug}
            href={`/compania/${company.slug}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 px-3 py-2 text-sm transition hover:border-accent/40 hover:bg-card-hover"
          >
            <span className="truncate font-semibold text-foreground">{company.name}</span>
            <span className="shrink-0 text-xs font-semibold text-accent">
              {company.gameCount.toLocaleString("es-ES")}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CompanyGrid({
  companies,
  compact = false,
}: {
  companies: CompanyExplorerData["companies"];
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
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug text-foreground">{company.name}</h3>
            <RoleBadge roleKind={company.roleKind} />
          </div>
          <p className="mt-1 text-sm text-accent">
            {company.gameCount.toLocaleString("es-ES")} juegos
          </p>
          {(company.developerCount > 0 || company.publisherCount > 0) && (
            <p className="mt-1 text-xs text-muted">
              Dev {company.developerCount.toLocaleString("es-ES")} · Pub{" "}
              {company.publisherCount.toLocaleString("es-ES")}
            </p>
          )}
          {company.platformPreview && (
            <p className="mt-2 line-clamp-2 text-xs text-muted">{company.platformPreview}</p>
          )}
          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            {company.hasProfile && (
              <span className="rounded-md border border-border bg-card-hover px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                Perfil
              </span>
            )}
            {company.grailCount > 0 && (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
                {company.grailCount} alto valor
              </span>
            )}
            {company.pricedCount > 0 && (
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-200">
                {company.pricedCount} con precio ES
              </span>
            )}
          </div>
        </Link>
      ))}
    </section>
  );
}

function RoleBadge({ roleKind }: { roleKind: CompanyExplorerData["companies"][number]["roleKind"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
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
    <article className="rounded-2xl border border-border bg-gradient-to-br from-white/[0.05] to-transparent p-5">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-accent">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </article>
  );
}

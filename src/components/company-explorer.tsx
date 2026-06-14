"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  COMPANY_MARKET_OPTIONS,
  COMPANY_SORT_OPTIONS,
  DEFAULT_COMPANY_FILTERS,
  companyListIntro,
  companyRoleLabel,
  filterCompanies,
  hasActiveCompanyFilters,
  type CompanyExplorerData,
  type CompanyIndexFilters,
  type CompanyRoleFilter,
} from "@/lib/company-index";

type Props = CompanyExplorerData;

const ROLE_TABS: { value: CompanyRoleFilter; label: string; hint: string }[] = [
  { value: "all", label: "Todas", hint: "Catálogo completo" },
  { value: "publishers", label: "Publicadoras", hint: "Han publicado al menos un título" },
  { value: "developers", label: "Desarrolladoras", hint: "Han desarrollado al menos un título" },
  { value: "both", label: "Ambos roles", hint: "Desarrollo y publicación" },
];

const selectClass =
  "rounded-xl border border-border bg-input px-4 py-2.5 text-sm text-foreground outline-none ring-accent/30 focus:ring-2";

const DISPLAY_CAP = 480;

export function CompanyExplorer({ companies, platformOptions, genreOptions, stats }: Props) {
  const [filters, setFilters] = useState<CompanyIndexFilters>(DEFAULT_COMPANY_FILTERS);

  const filtered = useMemo(() => filterCompanies(companies, filters), [companies, filters]);
  const visible = filtered.slice(0, DISPLAY_CAP);
  const filtersActive = hasActiveCompanyFilters(filters);

  const showGrouped =
    filters.role === "all" &&
    !filters.q.trim() &&
    filters.platform === "all" &&
    filters.genre === "all" &&
    filters.market === "all";

  const grouped = useMemo(() => {
    if (!showGrouped) return null;
    const publishers = filterCompanies(companies, { ...filters, role: "publishers" }).slice(0, 12);
    const developers = filterCompanies(companies, { ...filters, role: "developers" }).slice(0, 12);
    if (publishers.length === 0 && developers.length === 0) return null;
    return { publishers, developers };
  }, [companies, filters, showGrouped]);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Compañías" value={stats.total.toLocaleString("es-ES")} hint="Fichas unificadas" />
        <StatCard
          label="Publicadoras"
          value={stats.publishers.toLocaleString("es-ES")}
          hint={`${stats.dualRole.toLocaleString("es-ES")} también desarrollan`}
        />
        <StatCard
          label="Desarrolladoras"
          value={stats.developers.toLocaleString("es-ES")}
          hint="Con al menos un crédito de dev"
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
          Mostrando <strong className="text-foreground">{filtered.length.toLocaleString("es-ES")}</strong>{" "}
          compañías
          {filtered.length > DISPLAY_CAP && (
            <> · primeras {DISPLAY_CAP.toLocaleString("es-ES")} en pantalla</>
          )}
        </p>
      </section>

      {grouped && (
        <div className="space-y-8">
          <div className="grid gap-8 xl:grid-cols-2">
            <CompanyPreviewSection title="Publicadoras destacadas" items={grouped.publishers} />
            <CompanyPreviewSection title="Desarrolladoras destacadas" items={grouped.developers} />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Explorar catálogo completo</h2>
        </div>
      )}

      <CompanyGrid companies={visible} />

      {filtered.length === 0 && (
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
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <CompanyGrid companies={items} compact />
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
          className="rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-card-hover"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug text-foreground">{company.name}</h3>
            <RoleBadge roleKind={company.roleKind} />
          </div>
          <p className="mt-1 text-sm text-accent">
            {company.gameCount.toLocaleString("es-ES")} juegos
          </p>
          {(company.developerCount > 0 || company.publisherCount > 0) && (
            <p className="mt-1 text-xs text-foreground/75">
              Dev {company.developerCount.toLocaleString("es-ES")} · Pub{" "}
              {company.publisherCount.toLocaleString("es-ES")}
            </p>
          )}
          {company.platformPreview && (
            <p className="mt-2 line-clamp-2 text-xs text-muted">{company.platformPreview}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {company.hasProfile && (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/70">
                Perfil
              </span>
            )}
            {company.grailCount > 0 && (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200/90">
                {company.grailCount} alto valor
              </span>
            )}
            {company.pricedCount > 0 && (
              <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200/80">
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
        roleKind === "publisher" && "bg-sky-500/15 text-sky-200",
        roleKind === "developer" && "bg-violet-500/15 text-violet-200",
        roleKind === "both" && "bg-emerald-500/15 text-emerald-200",
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

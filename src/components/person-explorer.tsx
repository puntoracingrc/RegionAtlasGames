"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { PersonPortrait } from "@/components/person-portrait";
import { cn } from "@/lib/cn";
import {
  DEFAULT_PERSON_EXPLORER_FILTERS,
  filterPersonCards,
  parsePersonExplorerFilters,
  serializePersonExplorerFilters,
  type PersonExplorerFilterState,
} from "@/lib/person-explorer-filters";
import type { PersonExpertiseFilterOption } from "@/lib/person-expertise";
import type { PersonPlatformFilterGroup } from "@/lib/person-platform-filters";
import type { PersonCardData } from "@/lib/person-research-types";

const PAGE_SIZE = 48;

function PersonCard({ person, priority = false }: { person: PersonCardData; priority?: boolean }) {
  return (
    <Link
      href={`/persona/${person.slug}`}
      className="group grid h-[24.5rem] grid-rows-[11rem_1fr] overflow-hidden rounded-lg border border-border bg-card transition hover:-translate-y-0.5 hover:border-accent/35 hover:bg-card-hover hover:shadow-lg sm:h-[23.5rem]"
    >
      <PersonPortrait
        src={person.portraitPath}
        name={person.name}
        sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 18vw"
        priority={priority}
        fit="contain"
        className="h-44 w-full border-b border-border"
      />
      <div className="flex min-w-0 flex-col p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="line-clamp-2 min-h-12 text-base font-bold leading-6 text-foreground group-hover:text-accent">
            {person.name}
          </h2>
          <span className="shrink-0 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            Revisada
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted">
          {[person.lifeLabel, person.origin].filter(Boolean).join(" · ") || "Trayectoria documentada"}
        </p>
        <p className="mt-3 line-clamp-2 text-sm leading-5 text-foreground/80">
          {person.occupations.join(" · ") || "Profesional de la industria del videojuego"}
        </p>
        <div className="mt-auto pt-3 text-xs text-muted">
          {person.companies.length > 0 && <p className="truncate">{person.companies.map((item) => item.name).join(" · ")}</p>}
          {person.works.length > 0 && <p className="mt-1 truncate text-foreground/75">{person.works.join(" · ")}</p>}
        </div>
      </div>
    </Link>
  );
}

export function PersonExplorer({
  people,
  platformGroups,
  expertiseOptions,
}: {
  people: PersonCardData[];
  platformGroups: PersonPlatformFilterGroup[];
  expertiseOptions: PersonExpertiseFilterOption[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamString = searchParams.toString();
  const filters = useMemo(
    () =>
      parsePersonExplorerFilters(
        new URLSearchParams(searchParamString),
        expertiseOptions,
        platformGroups,
      ),
    [expertiseOptions, platformGroups, searchParamString],
  );
  const deferredQuery = useDeferredValue(filters.query);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const selectedPlatformGroup = platformGroups.find((group) => group.brand === filters.brand);

  function commitFilters(next: PersonExplorerFilterState) {
    setVisible(PAGE_SIZE);
    const params = serializePersonExplorerFilters(
      new URLSearchParams(window.location.search),
      next,
    );
    const queryString = params.toString();
    window.history.replaceState(
      null,
      "",
      queryString ? `${pathname}?${queryString}` : pathname,
    );
  }

  const filtered = useMemo(() => {
    return filterPersonCards(
      people,
      {
        query: deferredQuery,
        expertise: filters.expertise,
        brand: filters.brand,
        platformSlug: filters.platformSlug,
        sort: filters.sort,
      },
      platformGroups,
    );
  }, [
    deferredQuery,
    filters.brand,
    filters.expertise,
    filters.platformSlug,
    filters.sort,
    people,
    platformGroups,
  ]);

  const active =
    filters.query.trim() ||
    filters.expertise !== "all" ||
    filters.brand !== "all" ||
    filters.platformSlug !== "all" ||
    filters.sort !== "name";
  const shown = filtered.slice(0, visible);

  function reset() {
    commitFilters(DEFAULT_PERSON_EXPLORER_FILTERS);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-4 md:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar persona"
            aria-controls="person-results"
            placeholder="Nombre, alias, compañía, país, ocupación u obra"
            value={filters.query}
            onChange={(event) => {
              commitFilters({ ...filters, query: event.target.value });
            }}
            className="input pl-10"
          />
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Especialidad
          </legend>
          <div className="flex flex-wrap gap-2">
            {[
              { value: "all" as const, label: "Todas", count: people.length },
              ...expertiseOptions,
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filters.expertise === option.value}
                aria-controls="person-results"
                onClick={() => {
                  commitFilters({ ...filters, expertise: option.value });
                }}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  filters.expertise === option.value
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-background/45 text-foreground/80 hover:bg-card-hover",
                )}
              >
                <span>{option.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    filters.expertise === option.value
                      ? "bg-black/15 text-current dark:bg-white/20"
                      : "bg-foreground/8 text-muted",
                  )}
                  aria-label={`${option.count} personas`}
                >
                  {option.count.toLocaleString("es-ES")}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-4 border-t border-border pt-4">
          <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Marca
          </legend>
          <div className="flex flex-wrap gap-2">
            {[
              { brand: "all" as const, label: "Todas las marcas" },
              ...platformGroups,
            ].map((option) => (
              <button
                key={option.brand}
                type="button"
                aria-pressed={filters.brand === option.brand}
                aria-controls="person-results"
                onClick={() => {
                  commitFilters({ ...filters, brand: option.brand, platformSlug: "all" });
                }}
                className={cn(
                  "min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  filters.brand === option.brand
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-background/45 text-foreground/80 hover:bg-card-hover",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(17rem,24rem)_15rem_auto]">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              Plataforma
            </span>
            <select
              className="input disabled:cursor-not-allowed disabled:opacity-60"
              value={filters.platformSlug}
              disabled={!selectedPlatformGroup}
              onChange={(event) => {
                commitFilters({ ...filters, platformSlug: event.target.value });
              }}
            >
              <option value="all">
                {selectedPlatformGroup
                  ? `Todas las plataformas de ${selectedPlatformGroup.label}`
                  : "Selecciona primero una marca"}
              </option>
              {selectedPlatformGroup?.platforms.map((platform) => (
                <option key={platform.slug} value={platform.slug}>
                  {platform.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Orden</span>
            <select
              className="input"
              value={filters.sort}
              onChange={(event) =>
                commitFilters({
                  ...filters,
                  sort: event.target.value as PersonExplorerFilterState["sort"],
                })
              }
            >
              <option value="name">Nombre (A-Z)</option>
              <option value="birth">Nacimiento</option>
            </select>
          </label>
          <div className="flex items-end justify-between gap-3 sm:col-span-2 lg:col-span-1 lg:justify-end">
            <p className="pb-2.5 text-sm text-muted" aria-live="polite" aria-atomic="true">
              <strong className="text-foreground">{filtered.length.toLocaleString("es-ES")}</strong> personas
            </p>
            {active && (
              <button type="button" className="btn-secondary gap-2" onClick={reset} title="Limpiar filtros">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Limpiar</span>
              </button>
            )}
          </div>
        </div>
      </section>

      <div id="person-results">
        {shown.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {shown.map((person, index) => (
              <PersonCard key={person.slug} person={person} priority={index < 6} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card px-4 py-14 text-center text-sm text-muted">
            No hay personas que coincidan con los filtros.
          </div>
        )}
      </div>

      {shown.length < filtered.length && (
        <div className="flex justify-center">
          <button type="button" className="btn-secondary" onClick={() => setVisible((value) => value + PAGE_SIZE)}>
            Ver {Math.min(PAGE_SIZE, filtered.length - shown.length)} más
          </button>
        </div>
      )}
    </div>
  );
}

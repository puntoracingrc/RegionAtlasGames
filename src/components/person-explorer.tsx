"use client";

import Link from "next/link";
import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PersonPortrait } from "@/components/person-portrait";
import { cn } from "@/lib/cn";
import type {
  PersonCardData,
  PersonExpertise,
} from "@/lib/person-research-types";

const PAGE_SIZE = 48;

const expertiseOptions: { value: "all" | PersonExpertise; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "design", label: "Diseño" },
  { value: "programming", label: "Programación" },
  { value: "direction", label: "Dirección" },
  { value: "production", label: "Producción" },
  { value: "music", label: "Música" },
  { value: "art", label: "Arte" },
  { value: "founder", label: "Fundadores" },
  { value: "executive", label: "Gestión" },
];

type Sort = "name" | "birth";

function normalize(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/\p{M}/gu, "");
}

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

export function PersonExplorer({ people }: { people: PersonCardData[] }) {
  const [query, setQuery] = useState("");
  const [expertise, setExpertise] = useState<"all" | PersonExpertise>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    return people
      .filter((person) => !normalizedQuery || person.searchHaystack.includes(normalizedQuery))
      .filter((person) => expertise === "all" || person.expertise.includes(expertise))
      .sort((a, b) => {
        if (sort === "birth") {
          const aYear = Number(a.lifeLabel?.match(/\d{4}/)?.[0] ?? 9999);
          const bYear = Number(b.lifeLabel?.match(/\d{4}/)?.[0] ?? 9999);
          return aYear - bYear || a.name.localeCompare(b.name, "es");
        }
        return a.name.localeCompare(b.name, "es", { numeric: true });
      });
  }, [expertise, people, query, sort]);

  const active = query.trim() || expertise !== "all" || sort !== "name";
  const shown = filtered.slice(0, visible);

  function reset() {
    setQuery("");
    setExpertise("all");
    setSort("name");
    setVisible(PAGE_SIZE);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border bg-card p-4 md:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar persona"
            placeholder="Nombre, alias, compañía, país, ocupación u obra"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="input pl-10"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtrar por especialidad">
          {expertiseOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={expertise === option.value}
              onClick={() => {
                setExpertise(option.value);
                setVisible(PAGE_SIZE);
              }}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                expertise === option.value
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-background/45 text-foreground/80 hover:bg-card-hover",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[15rem_auto]">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Orden</span>
            <select className="input" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
              <option value="name">Nombre (A-Z)</option>
              <option value="birth">Nacimiento</option>
            </select>
          </label>
          <div className="flex items-end justify-between gap-3 lg:justify-end">
            <p className="pb-2.5 text-sm text-muted">
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

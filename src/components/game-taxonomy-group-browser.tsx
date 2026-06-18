"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { PublicTaxonomyGroup } from "@/lib/game-taxonomy-groups";
import { normalizeCatalogSearchText } from "@/lib/catalog-search-normalize";

const typeLabel = {
  genre: "Género",
  subgenre: "Subgénero",
  facet: "Etiqueta",
} as const;

export function GameTaxonomyGroupBrowser({ groups }: { groups: PublicTaxonomyGroup[] }) {
  const [query, setQuery] = useState("");
  const needle = normalizeCatalogSearchText(query);

  const filteredGroups = useMemo(() => {
    if (!needle) return groups;
    return groups.map((group) => ({
      ...group,
      terms: group.terms.filter((term) => {
        const haystack = normalizeCatalogSearchText([
          group.title,
          term.name,
          term.slug,
          term.type,
          term.family,
          ...term.aliases,
        ].filter(Boolean).join(" "));
        return needle.split(/\s+/).every((token) => haystack.includes(token));
      }),
    }));
  }, [groups, needle]);

  const visibleTerms = filteredGroups.reduce((total, group) => total + group.terms.length, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted" htmlFor="taxonomy-search">
          Buscar dentro de géneros y etiquetas
        </label>
        <input
          id="taxonomy-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ej. miedo, horror, football, juegos de golf, RPG, pixel art…"
          className="mt-2 w-full rounded-xl border border-border bg-input px-4 py-3 text-base outline-none ring-accent/25 placeholder:text-muted focus:ring-2"
        />
        <p className="mt-2 text-xs text-muted">
          {visibleTerms.toLocaleString("es-ES")} entidades visibles. El buscador entiende alias en español, inglés y frases habituales.
        </p>
      </div>

      <div className="grid gap-4">
        {filteredGroups.map((group) => (
          <section key={group.number} className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm md:p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                  {String(group.number).padStart(2, "0")}
                </p>
                <h2 className="mt-1 text-xl font-black text-foreground">{group.title}</h2>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-muted">{group.description}</p>
              </div>
              <p className="shrink-0 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-semibold text-muted">
                {group.terms.length.toLocaleString("es-ES")} entidades
              </p>
            </div>

            {group.terms.length > 0 ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.terms.map((term) => (
                  <Link
                    key={`${group.number}-${term.type}-${term.slug}`}
                    href={term.href}
                    className="group rounded-xl border border-border bg-background/55 p-3 transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card-hover"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-foreground group-hover:text-accent">{term.name}</h3>
                        <p className="mt-1 text-xs text-muted">
                          {typeLabel[term.type]}{term.family ? ` · ${term.family}` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-accent/10 px-2 py-1 text-xs font-bold text-accent">
                        {term.count.toLocaleString("es-ES")}
                      </span>
                    </div>
                    {term.aliases.length > 0 && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted/90">
                        Alias: {term.aliases.slice(0, 8).join(", ")}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-border bg-background/45 p-4 text-sm text-muted">
                Grupo preparado, pero todavía sin entidades aprobadas. Así no inventamos etiquetas ni duplicamos conceptos.
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

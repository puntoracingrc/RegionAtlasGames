"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { IndexEntry } from "@/lib/types";

type IndexKind = "company" | "genre" | "series" | "tag";

type Props = {
  items: IndexEntry[];
  kind: IndexKind;
};

const PLATFORM_PREVIEW = 4;
type EntitySort = "most-games" | "least-games" | "az" | "za";
const INDEX_KIND_META: Record<
  IndexKind,
  {
    searchLabel: string;
    basePath: "/compania" | "/genero" | "/saga" | "/etiqueta";
  }
> = {
  company: { searchLabel: "compañía", basePath: "/compania" },
  genre: { searchLabel: "género", basePath: "/genero" },
  series: { searchLabel: "saga", basePath: "/saga" },
  tag: { searchLabel: "etiqueta", basePath: "/etiqueta" },
};

export function IndexGrid({ items, kind }: Props) {
  const meta = INDEX_KIND_META[kind];
  const [q, setQ] = useState("");
  const [letter, setLetter] = useState("all");
  const [sort, setSort] = useState<EntitySort>("most-games");

  const letters = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const first = item.name.trim().charAt(0).toLocaleUpperCase("es-ES");
      if (!first) continue;
      set.add(/[A-ZÁÉÍÓÚÑÜ]/i.test(first) ? first : "0-9");
    }
    return [...set].sort((a, b) => {
      if (a === "0-9") return 1;
      if (b === "0-9") return -1;
      return a.localeCompare(b, "es");
    });
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matchesLetter = (item: IndexEntry) => {
      if (letter === "all") return true;
      const first = item.name.trim().charAt(0).toLocaleUpperCase("es-ES");
      if (letter === "0-9") return !/[A-ZÁÉÍÓÚÑÜ]/i.test(first);
      return first === letter;
    };
    const matchesSearch = (item: IndexEntry) =>
      !needle ||
      item.name.toLowerCase().includes(needle) ||
      item.slug.toLowerCase().includes(needle);
    return items
      .filter((item) => matchesLetter(item) && matchesSearch(item))
      .sort((a, b) => {
        if (sort === "az") return a.name.localeCompare(b.name, "es");
        if (sort === "za") return b.name.localeCompare(a.name, "es");
        if (sort === "least-games") {
          return a.gameCount - b.gameCount || a.name.localeCompare(b.name, "es");
        }
        return b.gameCount - a.gameCount || a.name.localeCompare(b.name, "es");
      })
      .slice(0, needle ? 240 : 160);
  }, [items, letter, q, sort]);

  const sortOptions: Array<{ value: EntitySort; label: string }> = [
    { value: "most-games", label: "Más juegos" },
    { value: "least-games", label: "Menos juegos" },
    { value: "az", label: "A-Z" },
    { value: "za", label: "Z-A" },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
        <input
          type="search"
          placeholder={`Buscar ${meta.searchLabel} por nombre o slug...`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm outline-none ring-accent/25 placeholder:text-muted focus:ring-2"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {sortOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSort(option.value)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                sort === option.value
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-background/60 text-foreground hover:bg-card-hover"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setLetter("all")}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              letter === "all"
                ? "border-accent bg-accent text-accent-fg"
                : "border-border bg-background/60 text-muted hover:text-foreground"
            }`}
          >
            Todas
          </button>
          {letters.map((itemLetter) => (
            <button
              key={itemLetter}
              type="button"
              onClick={() => setLetter(itemLetter)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                letter === itemLetter
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border bg-background/60 text-muted hover:text-foreground"
              }`}
            >
              {itemLetter}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-muted">
          Mostrando {filtered.length.toLocaleString("es-ES")} de{" "}
          {items.length.toLocaleString("es-ES")} {meta.searchLabel}
          {items.length === 1 ? "" : "s"}.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item) => {
          const platforms = Object.entries(item.byPlatform ?? {})
            .map(([slug, count]) => ({ name: slug.toUpperCase(), count }))
            .sort((a, b) => b.count - a.count);
          const developerCount = item.asDeveloper?.length ?? 0;
          const publisherCount = item.asPublisher?.length ?? 0;
          return (
            <Link
              key={item.slug}
              href={`${meta.basePath}/${item.slug}`}
              className="rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-card-hover"
            >
              <h2 className="font-semibold text-foreground">{item.name}</h2>
              <p className="mt-1 text-sm text-accent">
                {item.gameCount.toLocaleString("es-ES")} juegos
              </p>
              {platforms.length > 0 && (
                <p className="mt-2 line-clamp-2 text-xs text-muted">
                  {platforms
                    .slice(0, PLATFORM_PREVIEW)
                    .map((platform) => `${platform.name} (${platform.count})`)
                    .join(" · ")}
                </p>
              )}
              {kind === "company" &&
                (developerCount > 0 || publisherCount > 0) && (
                  <p className="mt-2 text-[11px] uppercase tracking-wider text-muted">
                    Dev {developerCount.toLocaleString("es-ES")} · Pub{" "}
                    {publisherCount.toLocaleString("es-ES")}
                  </p>
                )}
            </Link>
          );
        })}
      </section>

      {!q && letter === "all" && items.length > 160 && (
        <p className="text-center text-sm text-muted">
          Mostrando 160 de {items.length.toLocaleString("es-ES")}. Usa el buscador o la inicial para encontrar
          más.
        </p>
      )}
    </div>
  );
}

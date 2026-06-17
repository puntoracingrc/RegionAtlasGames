"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { IndexEntry } from "@/lib/types";

type IndexKind = "company" | "genre" | "series";

type Props = {
  items: IndexEntry[];
  kind: IndexKind;
};

const PLATFORM_PREVIEW = 4;
const INDEX_KIND_META: Record<
  IndexKind,
  {
    searchLabel: string;
    basePath: "/compania" | "/genero" | "/saga";
  }
> = {
  company: { searchLabel: "compañía", basePath: "/compania" },
  genre: { searchLabel: "género", basePath: "/genero" },
  series: { searchLabel: "saga", basePath: "/saga" },
};

export function IndexGrid({ items, kind }: Props) {
  const meta = INDEX_KIND_META[kind];
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 120);
    return items
      .filter((item) => item.name.toLowerCase().includes(needle))
      .slice(0, 200);
  }, [items, q]);

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder={`Buscar ${meta.searchLabel}...`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full max-w-md rounded-lg border border-border bg-input px-3.5 py-2 text-sm outline-none ring-accent/25 placeholder:text-muted focus:ring-2"
      />

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

      {!q && items.length > 120 && (
        <p className="text-center text-sm text-muted">
          Mostrando 120 de {items.length.toLocaleString("es-ES")}. Usa el buscador para encontrar
          más.
        </p>
      )}
    </div>
  );
}

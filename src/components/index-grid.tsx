"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { IndexKind } from "@/lib/index-entity";
import { INDEX_KIND_META, summarizeIndexEntry } from "@/lib/index-entity";
import type { IndexEntry } from "@/lib/types";

type Props = {
  items: IndexEntry[];
  kind: IndexKind;
};

const PLATFORM_PREVIEW = 4;

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
          const summary = summarizeIndexEntry(item, kind);
          return (
            <Link
              key={item.slug}
              href={`${meta.basePath}/${item.slug}`}
              className="rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-card-hover"
            >
              <h2 className="font-semibold text-foreground">{summary.name}</h2>
              <p className="mt-1 text-sm text-accent">
                {summary.gameCount.toLocaleString("es-ES")} juegos
              </p>
              {summary.platforms.length > 0 && (
                <p className="mt-2 line-clamp-2 text-xs text-muted">
                  {summary.platforms
                    .slice(0, PLATFORM_PREVIEW)
                    .map((platform) => `${platform.name} (${platform.count})`)
                    .join(" · ")}
                </p>
              )}
              {kind === "company" &&
                (summary.developerCount > 0 || summary.publisherCount > 0) && (
                  <p className="mt-2 text-[11px] uppercase tracking-wider text-muted">
                    Dev {summary.developerCount.toLocaleString("es-ES")} · Pub{" "}
                    {summary.publisherCount.toLocaleString("es-ES")}
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

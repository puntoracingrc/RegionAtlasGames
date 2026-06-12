"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { IndexEntry } from "@/lib/types";
import { platformBreakdown } from "@/lib/indexes";

type Props = {
  items: IndexEntry[];
  basePath: "/compania" | "/genero" | "/saga";
  label: string;
};

export function IndexGrid({ items, basePath, label }: Props) {
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
        placeholder={`Buscar ${label.toLowerCase()}...`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full max-w-md rounded-lg border border-border bg-input px-3.5 py-2 text-sm outline-none ring-accent/25 placeholder:text-muted focus:ring-2"
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((item) => (
          <Link
            key={item.slug}
            href={`${basePath}/${item.slug}`}
            className="rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40 hover:bg-card-hover"
          >
            <h2 className="font-semibold text-foreground">{item.name}</h2>
            <p className="mt-1 text-sm text-accent">{item.gameCount} juegos</p>
            <p className="mt-2 line-clamp-2 text-xs text-muted">
              {platformBreakdown(item)
                .slice(0, 4)
                .map((p) => `${p.name} (${p.count})`)
                .join(" · ")}
            </p>
            {"asDeveloper" in item && item.asDeveloper && item.asPublisher && (
              <p className="mt-2 text-[11px] uppercase tracking-wider text-muted">
                Dev {item.asDeveloper.length} · Pub {item.asPublisher.length}
              </p>
            )}
          </Link>
        ))}
      </section>

      {!q && items.length > 120 && (
        <p className="text-center text-sm text-muted">
          Mostrando 120 de {items.length}. Usa el buscador para encontrar más.
        </p>
      )}
    </div>
  );
}

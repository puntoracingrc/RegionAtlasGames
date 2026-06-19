"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import { getPhysicalVariant } from "@/lib/physical-variants";

type GameRow = {
  catalogId: string;
  title: string;
  platformSlug: string;
  region: string;
  physicalVariant: string | null;
  coverUrl: string | null;
};

export function AdminCatalogSearchPanel() {
  const [q, setQ] = useState("");
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setGames([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: q.trim(), limit: "40" });
        const res = await fetch(`/api/admin/catalog/search?${params}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (res.ok) setGames(data.games ?? []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [q]);

  return (
    <Panel className={adminToneClass("search")}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <PanelTitle eyebrow="Catálogo maestro">Editar juegos publicados</PanelTitle>
          <p className="max-w-2xl text-sm leading-6 text-muted">
            Busca por título, slug o id de catálogo. Desde la ficha puedes cambiar portada, precios,
            descripción y datos principales.
          </p>
        </div>
        <Link href="/admin/juegos/nuevo" className="btn-primary w-full md:w-auto">
          + Crear juego
        </Link>
      </div>

      <div className="my-5 rounded-2xl border border-border bg-background/45 p-3">
        <label className="block">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted">
            Buscador
          </span>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej: Zelda, ps4-11-11, Memories Retold…"
          />
        </label>
      </div>

      {q.trim().length < 2 ? (
        <p className="text-sm text-muted">Escribe para buscar en el catálogo.</p>
      ) : loading ? (
        <p className="text-sm text-muted">Buscando…</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">Sin resultados.</p>
      ) : (
        <ul className="grid gap-3">
          {games.map((game) => (
            <li
              key={game.catalogId}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-background/45 p-4 transition hover:border-accent/40 hover:bg-card-hover md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/juegos/${encodeURIComponent(game.catalogId)}`}
                  className="font-semibold text-foreground hover:text-accent"
                >
                  {game.title}
                </Link>
                <p className="text-xs text-muted">
                  {game.catalogId} · {game.platformSlug} · {game.region}
                  {game.physicalVariant ? ` · ${getPhysicalVariant(game.physicalVariant)?.shortLabel ?? game.physicalVariant}` : ""}
                </p>
              </div>
              <Link
                href={`/admin/juegos/${encodeURIComponent(game.catalogId)}`}
                className="btn-secondary shrink-0 text-xs"
              >
                Editar →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

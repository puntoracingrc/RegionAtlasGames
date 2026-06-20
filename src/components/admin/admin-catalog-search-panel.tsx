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

type PlatformOption = {
  slug: string;
  name: string;
  active?: boolean;
};

export function AdminCatalogSearchPanel() {
  const [q, setQ] = useState("");
  const [platformSlug, setPlatformSlug] = useState("");
  const [region, setRegion] = useState("");
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [platforms, setPlatforms] = useState<PlatformOption[]>([]);
  const [regions, setRegions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/entities/platforms")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.platforms) ? data.platforms : [];
        setPlatforms(
          rows
            .map((platform: PlatformOption) => ({
              slug: platform.slug,
              name: platform.name,
              active: platform.active,
            }))
            .filter((platform: PlatformOption) => platform.slug && platform.name)
            .sort((a: PlatformOption, b: PlatformOption) => a.name.localeCompare(b.name, "es", { numeric: true })),
        );
      })
      .catch(() => undefined);
    fetch("/api/admin/catalog/search?filters=1")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active) return;
        const rows = Array.isArray(data?.regions) ? data.regions : [];
        setRegions(rows.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const cleanQ = q.trim();
    if (cleanQ.length < 2 && !platformSlug && !region) {
      setGames([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: cleanQ, limit: "80" });
        if (platformSlug) params.set("platformSlug", platformSlug);
        if (region) params.set("region", region);
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
  }, [q, platformSlug, region]);

  const hasSearch = q.trim().length >= 2 || platformSlug || region;

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

      <div className="my-5 grid gap-3 rounded-2xl border border-border bg-background/45 p-3 md:grid-cols-[1fr_260px_220px]">
        <label className="block md:col-span-3 lg:col-span-1">
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
        <label className="block">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted">
            Plataforma
          </span>
          <select className="input" value={platformSlug} onChange={(e) => setPlatformSlug(e.target.value)}>
            <option value="">Todas las plataformas</option>
            {platforms.map((platform) => (
              <option key={platform.slug} value={platform.slug}>
                {platform.name}{platform.active === false ? " · apagada" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-muted">
            Región
          </span>
          <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Todas las regiones</option>
            {regions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!hasSearch ? (
        <p className="text-sm text-muted">Escribe para buscar o filtra por plataforma y región.</p>
      ) : loading ? (
        <p className="text-sm text-muted">Buscando…</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted">Sin resultados.</p>
      ) : (
        <div className="grid gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {games.length} resultados visibles
          </p>
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
        </div>
      )}
    </Panel>
  );
}

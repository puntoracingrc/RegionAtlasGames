"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type { AdminSeriesGameRow } from "@/lib/admin-series-manager";

type Option = { slug: string; name: string; count: number | null };

type BulkOptions = {
  platforms: Option[];
  regions: Option[];
  genres: Option[];
  subgenres: Option[];
  facets: Option[];
};

const emptyOptions: BulkOptions = {
  platforms: [],
  regions: [],
  genres: [],
  subgenres: [],
  facets: [],
};

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function regionLabel(region: string): string {
  if (region === "PAL España") return "ES";
  if (region === "PAL Europa") return "EU";
  if (region === "NTSC USA") return "USA";
  if (region === "NTSC-J Japón") return "JP";
  return region;
}

function gameSubtitle(game: AdminSeriesGameRow): string {
  return [game.platformSlug.toUpperCase(), regionLabel(game.region), game.year ? String(game.year) : null]
    .filter(Boolean)
    .join(" · ");
}

function optionLabel(option: Option): string {
  return option.count === null ? option.name : `${option.name} (${option.count})`;
}

export function AdminBulkGameActionsPanel() {
  const [options, setOptions] = useState<BulkOptions>(emptyOptions);
  const [q, setQ] = useState("");
  const [platformSlug, setPlatformSlug] = useState("");
  const [region, setRegion] = useState("");
  const [genreSlug, setGenreSlug] = useState("");
  const [facetSlug, setFacetSlug] = useState("");
  const [results, setResults] = useState<AdminSeriesGameRow[]>([]);
  const [selection, setSelection] = useState<AdminSeriesGameRow[]>([]);
  const [tagsInput, setTagsInput] = useState("");
  const [facetsInput, setFacetsInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedIds = useMemo(() => new Set(selection.map((game) => game.id)), [selection]);
  const visibleResults = useMemo(
    () => results.filter((game) => !selectedIds.has(game.id)),
    [results, selectedIds],
  );
  const hasFilters = q.trim().length >= 2 || platformSlug || region || genreSlug || facetSlug;

  const loadOptions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ mode: "options" });
      const res = await fetch(`/api/admin/bulk-game-actions?${params}`);
      const data = await res.json();
      if (res.ok) setOptions(data.options ?? emptyOptions);
    } catch {
      setOptions(emptyOptions);
    }
  }, []);

  const searchGames = useCallback(async () => {
    if (!hasFilters) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "120" });
      if (q.trim()) params.set("q", q.trim());
      if (platformSlug) params.set("platformSlug", platformSlug);
      if (region) params.set("region", region);
      if (genreSlug) params.set("genreSlug", genreSlug);
      if (facetSlug) params.set("facetSlug", facetSlug);
      const res = await fetch(`/api/admin/bulk-game-actions?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudieron buscar juegos.");
        setResults([]);
        return;
      }
      setResults(data.games ?? []);
    } catch {
      setError("Error de red al buscar juegos.");
    } finally {
      setLoading(false);
    }
  }, [facetSlug, genreSlug, hasFilters, platformSlug, q, region]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchGames();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchGames]);

  function addToSelection(games: AdminSeriesGameRow[]) {
    setSelection((current) => {
      const map = new Map(current.map((game) => [game.id, game]));
      for (const game of games) map.set(game.id, game);
      return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "es", { numeric: true }));
    });
  }

  function removeFromSelection(gameId: string) {
    setSelection((current) => current.filter((game) => game.id !== gameId));
  }

  function clearFilters() {
    setQ("");
    setPlatformSlug("");
    setRegion("");
    setGenreSlug("");
    setFacetSlug("");
    setResults([]);
  }

  async function applyBulkAssignment() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/bulk-game-actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk-assign",
          gameIds: selection.map((game) => game.id),
          tags: parseCsv(tagsInput),
          facets: parseCsv(facetsInput),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo aplicar la asignación masiva.");
        return;
      }
      setMessage(`Asignación aplicada a ${data.affectedCount ?? 0} juegos.`);
      setTagsInput("");
      setFacetsInput("");
    } catch {
      setError("Error de red al aplicar la asignación masiva.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <PanelTitle eyebrow="Acciones masivas">Grupo de trabajo de juegos</PanelTitle>
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Filtra juegos, pásalos a una lista editable y aplica etiquetas o facetas en bloque sin depender de una saga.
              Es como una mesa de montaje: metes, sacas, revisas y aplicas solo cuando lo tengas claro.
            </p>
          </div>
          <Link href="/admin/entidades" className="btn-secondary w-full lg:w-auto">
            Gestionar sagas
          </Link>
        </div>
      </Panel>

      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-100/70 p-4 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-100/70 p-4 text-sm text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-200">
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
        <Panel>
          <PanelTitle eyebrow="Buscar y filtrar">Encontrar juegos</PanelTitle>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="block space-y-1 md:col-span-2 xl:col-span-3">
              <span className="text-[10px] uppercase tracking-wider text-muted">Texto</span>
              <input
                className="input"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Título, referencia, compañía, género…"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span>
              <select className="input" value={platformSlug} onChange={(event) => setPlatformSlug(event.target.value)}>
                <option value="">Todas</option>
                {options.platforms.map((option) => (
                  <option key={option.slug} value={option.slug}>{optionLabel(option)}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Región</span>
              <select className="input" value={region} onChange={(event) => setRegion(event.target.value)}>
                <option value="">Todas</option>
                {options.regions.map((option) => (
                  <option key={option.slug} value={option.slug}>{optionLabel(option)}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Género</span>
              <select className="input" value={genreSlug} onChange={(event) => setGenreSlug(event.target.value)}>
                <option value="">Todos</option>
                {options.genres.map((option) => (
                  <option key={option.slug} value={option.slug}>{optionLabel(option)}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 md:col-span-2 xl:col-span-3">
              <span className="text-[10px] uppercase tracking-wider text-muted">Subgénero / faceta ya asignada</span>
              <select className="input" value={facetSlug} onChange={(event) => setFacetSlug(event.target.value)}>
                <option value="">Cualquiera</option>
                <optgroup label="Subgéneros">
                  {options.subgenres.map((option) => (
                    <option key={`subgenre-${option.slug}`} value={option.slug}>{option.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Facetas">
                  {options.facets.map((option) => (
                    <option key={`facet-${option.slug}`} value={option.slug}>{option.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {hasFilters
                ? loading
                  ? "Buscando…"
                  : `${visibleResults.length} resultados disponibles para añadir`
                : "Usa texto o cualquier filtro para buscar."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-xs" onClick={clearFilters}>
                Limpiar filtros
              </button>
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={visibleResults.length === 0}
                onClick={() => addToSelection(visibleResults)}
              >
                Añadir resultados visibles
              </button>
            </div>
          </div>

          <div className="mt-4 grid max-h-[680px] gap-2 overflow-auto pr-1">
            {visibleResults.map((game) => (
              <div key={game.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background/45 p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground">{game.title}</div>
                  <div className="text-xs text-muted">{gameSubtitle(game)}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {game.genres.slice(0, 4).map((genre) => <Badge key={genre.slug}>{genre.name}</Badge>)}
                    {game.tags.slice(0, 3).map((tag) => <Badge key={`tag-${tag.slug}`} tone="green">{tag.name}</Badge>)}
                    {game.facets.slice(0, 3).map((facet) => <Badge key={`facet-${facet.slug}`} tone="amber">{facet.name}</Badge>)}
                  </div>
                </div>
                <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => addToSelection([game])}>
                  Añadir a lista
                </button>
              </div>
            ))}
            {hasFilters && !loading && visibleResults.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
                Sin resultados nuevos con esos filtros.
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <PanelTitle eyebrow="Lista editable">{selection.length} juegos seleccionados</PanelTitle>
              <p className="text-sm text-muted">Quita lo que no encaje antes de aplicar cambios.</p>
            </div>
            <button type="button" className="btn-secondary text-xs" disabled={selection.length === 0} onClick={() => setSelection([])}>
              Vaciar lista
            </button>
          </div>

          <div className="grid max-h-[420px] gap-2 overflow-auto pr-1">
            {selection.map((game) => (
              <div key={game.id} className="grid gap-3 rounded-2xl border border-border bg-background/45 p-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{game.title}</div>
                  <div className="text-xs text-muted">{gameSubtitle(game)}</div>
                </div>
                <button
                  type="button"
                  className="rounded-xl border border-rose-400/40 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/10 dark:text-rose-300"
                  onClick={() => removeFromSelection(game.id)}
                >
                  Quitar
                </button>
              </div>
            ))}
            {selection.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
                Todavía no hay juegos en la lista. Añade resultados desde la izquierda.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-2xl border border-violet-300/50 bg-violet-100/40 p-4 dark:border-violet-400/30 dark:bg-violet-950/20">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
              Aplicar a la lista
            </h3>
            <div className="grid gap-3">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Etiquetas</span>
                <input
                  className="input"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="soulslike, cooperativo, mundo abierto…"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Facetas</span>
                <input
                  className="input"
                  value={facetsInput}
                  onChange={(event) => setFacetsInput(event.target.value)}
                  placeholder="Edición completa, remaster, multijugador local…"
                />
              </label>
            </div>
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              disabled={saving || selection.length === 0}
              onClick={() => void applyBulkAssignment()}
            >
              {saving ? "Aplicando…" : `Aplicar a ${selection.length} juegos`}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

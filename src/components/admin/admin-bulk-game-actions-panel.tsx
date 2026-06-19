"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminNotice } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type { AdminSeriesGameRow } from "@/lib/admin-series-manager";

type Option = {
  slug: string;
  name: string;
  count: number | null;
  parentGenreSlugs?: string[];
  family?: string;
};

type BulkOptions = {
  platforms: Option[];
  regions: Option[];
  genres: Option[];
  tags: Option[];
  subgenres: Option[];
  facets: Option[];
};

const emptyOptions: BulkOptions = {
  platforms: [],
  regions: [],
  genres: [],
  tags: [],
  subgenres: [],
  facets: [],
};

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

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true }),
  );
}

function namesFromSelection(
  games: AdminSeriesGameRow[],
  field: "genres" | "facets",
): string[] {
  return uniqueNames(games.flatMap((game) => game[field].map((entity) => entity.name)));
}

function namesFromSelectionByOptions(games: AdminSeriesGameRow[], options: Option[]): string[] {
  const optionSlugs = new Set(options.map((option) => option.slug));
  return uniqueNames(
    games.flatMap((game) =>
      game.facets
        .filter((entity) => optionSlugs.has(entity.slug))
        .map((entity) => entity.name),
    ),
  );
}

function SelectableOptionList({
  title,
  helper,
  options,
  selected,
  onChange,
}: {
  title: string;
  helper?: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleOptions = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return options
      .filter((option) => !normalizedQuery || normalizeSearch(`${option.name} ${option.family ?? ""}`).includes(normalizedQuery))
      .slice(0, 60);
  }, [options, query]);

  function toggle(name: string) {
    if (selectedSet.has(name)) {
      onChange(selected.filter((item) => item !== name));
      return;
    }
    onChange([...selected, name].sort((a, b) => a.localeCompare(b, "es", { numeric: true })));
  }

  function clearSelected() {
    onChange([]);
  }

  return (
    <div className="rounded-2xl border border-indigo-300/50 bg-indigo-100/30 p-3 dark:border-indigo-400/20 dark:bg-indigo-950/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</p>
          {helper ? <p className="mt-1 text-xs text-muted">{helper}</p> : null}
        </div>
        {selected.length ? (
          <button type="button" className="text-xs font-semibold text-accent hover:underline" onClick={clearSelected}>
            Limpiar
          </button>
        ) : null}
      </div>
      <input
        className="input mt-3"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filtrar opciones…"
      />
      {selected.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((name) => (
            <button
              key={name}
              type="button"
              className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
              onClick={() => toggle(name)}
              title="Quitar"
            >
              {name} ×
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid max-h-56 gap-2 overflow-auto pr-1">
        {visibleOptions.map((option) => {
          const checked = selectedSet.has(option.name);
          return (
            <label
              key={option.slug}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                checked
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border bg-card/50 text-muted hover:border-accent/50 hover:text-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{optionLabel(option)}</span>
                {option.family ? <span className="text-[10px] uppercase tracking-wider text-muted">{option.family}</span> : null}
              </span>
              <input type="checkbox" checked={checked} onChange={() => toggle(option.name)} />
            </label>
          );
        })}
        {visibleOptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted">
            No hay opciones con ese filtro.
          </p>
        ) : null}
      </div>
      {options.length > visibleOptions.length ? (
        <p className="mt-2 text-xs text-muted">Mostrando {visibleOptions.length} de {options.length}; usa el filtro para afinar.</p>
      ) : null}
    </div>
  );
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
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedSubgenres, setSelectedSubgenres] = useState<string[]>([]);
  const [selectedFacets, setSelectedFacets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const selectedIds = useMemo(() => new Set(selection.map((game) => game.id)), [selection]);
  const selectedGenreSlugs = useMemo(() => {
    const selectedGenreNames = new Set(selectedGenres.map((name) => normalizeSearch(name)));
    return options.genres
      .filter((option) => selectedGenreNames.has(normalizeSearch(option.name)))
      .map((option) => option.slug);
  }, [options.genres, selectedGenres]);
  const selectableSubgenres = useMemo(() => {
    const scopeSlugs = selectedGenreSlugs.length ? selectedGenreSlugs : genreSlug ? [genreSlug] : [];
    if (scopeSlugs.length === 0) return options.subgenres;
    const scopeSet = new Set(scopeSlugs);
    const scoped = options.subgenres.filter((option) => option.parentGenreSlugs?.some((slug) => scopeSet.has(slug)));
    return scoped.length ? scoped : options.subgenres;
  }, [genreSlug, options.subgenres, selectedGenreSlugs]);
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

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "120" });
      if (q.trim()) params.set("q", q.trim());
      if (platformSlug) params.set("platformSlug", platformSlug);
      if (region) params.set("region", region);
      if (genreSlug) params.set("genreSlug", genreSlug);
      if (facetSlug) params.set("facetSlug", facetSlug);
      const res = await fetch(`/api/admin/bulk-game-actions?${params}`, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudieron buscar juegos.");
        setResults([]);
        return;
      }
      setResults(data.games ?? []);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError("Error de red al buscar juegos.");
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setLoading(false);
      }
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

  useEffect(() => {
    setSelectedGenres(namesFromSelection(selection, "genres"));
    setSelectedSubgenres(namesFromSelectionByOptions(selection, options.subgenres));
    setSelectedFacets(namesFromSelectionByOptions(selection, options.facets));
  }, [options.facets, options.subgenres, selection]);

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
          genres: selectedGenres,
          tags: [],
          facets: [...selectedSubgenres, ...selectedFacets],
          replaceLabels: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo aplicar la asignación masiva.");
        return;
      }
      setMessage(`Asignación aplicada a ${data.affectedCount ?? 0} juegos.`);
      const nextGenres = uniqueNames(selectedGenres).map((name) => ({ name, slug: normalizeSearch(name).replace(/\s+/g, "-") }));
      const nextFacets = uniqueNames([...selectedSubgenres, ...selectedFacets]).map((name) => ({ name, slug: normalizeSearch(name).replace(/\s+/g, "-") }));
      setSelection((current) => current.map((game) => ({ ...game, genres: nextGenres, tags: [], facets: nextFacets })));
      setSelectedGenres(nextGenres.map((genre) => genre.name));
      setSelectedSubgenres(uniqueNames(selectedSubgenres));
      setSelectedFacets(uniqueNames(selectedFacets));
    } catch {
      setError("Error de red al aplicar la asignación masiva.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel className="border-indigo-300/40 bg-indigo-50/40 dark:border-indigo-400/20 dark:bg-indigo-950/10">
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
        <AdminNotice tone="danger">{error}</AdminNotice>
      )}
      {message && (
        <AdminNotice tone="status">{message}</AdminNotice>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
        <Panel className="border-sky-300/40 bg-sky-50/40 dark:border-sky-400/20 dark:bg-sky-950/10">
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
              <div key={game.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-300/40 bg-background/45 p-3 transition hover:border-sky-400/50 dark:border-sky-400/20">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-foreground">{game.title}</div>
                  <div className="text-xs text-muted">{gameSubtitle(game)}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {game.genres.slice(0, 4).map((genre) => <Badge key={genre.slug}>{genre.name}</Badge>)}
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

        <Panel className="border-amber-300/40 bg-amber-50/40 dark:border-amber-400/20 dark:bg-amber-950/10">
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
              <div key={game.id} className="grid gap-3 rounded-2xl border border-amber-300/40 bg-background/45 p-3 dark:border-amber-400/20 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{game.title}</div>
                  <div className="text-xs text-muted">{gameSubtitle(game)}</div>
                  <div className="mt-3 grid gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Géneros base</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {game.genres.length ? game.genres.map((genre) => <Badge key={genre.slug}>{genre.name}</Badge>) : <span className="text-xs text-muted">Sin géneros.</span>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Subgéneros y facetas activas</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {game.facets.length ? game.facets.map((facet) => <Badge key={facet.slug} tone="amber">{facet.name}</Badge>) : <span className="text-xs text-muted">Sin facetas.</span>}
                      </div>
                    </div>
                  </div>
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
              <SelectableOptionList
                title="1. Género"
                helper="Elige el género principal usando los nombres oficiales en castellano."
                options={options.genres}
                selected={selectedGenres}
                onChange={setSelectedGenres}
              />
              <SelectableOptionList
                title="2. Subgénero"
                helper="Primero aparecen los subgéneros relacionados con el género elegido o filtrado."
                options={selectableSubgenres}
                selected={selectedSubgenres}
                onChange={setSelectedSubgenres}
              />
              <SelectableOptionList
                title="3. Facetas"
                helper="Mecánicas, formato, tema, edición, modo de juego y otras facetas aprobadas."
                options={options.facets}
                selected={selectedFacets}
                onChange={setSelectedFacets}
              />
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

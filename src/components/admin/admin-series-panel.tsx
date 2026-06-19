"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminFunctionCard, AdminFunctionHeader, AdminNotice } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import taxonomyData from "../../../data/game-facets-taxonomy.json";
import type {
  AdminSeriesDetail,
  AdminSeriesGameRow,
  AdminSeriesPlatformOption,
  AdminSeriesRow,
} from "@/lib/admin-series-manager";

type LabelOption = {
  slug: string;
  name: string;
  count: number | null;
  family?: string;
};

type SeriesTaxonomyOptions = {
  genres: LabelOption[];
  tags: LabelOption[];
  facets: LabelOption[];
};

type BulkLabelOperation = "add" | "remove" | "replace";
type LabelPickerKind = "genres" | "subgenres" | "facets";

const FAMILY_LABELS: Record<string, string> = {
  subgenre: "Subgéneros",
  content: "Contenido",
  edition: "Ediciones",
  format: "Formato",
  gameplay: "Gameplay",
  market: "Mercado",
  mechanic: "Mecánicas",
  perspective: "Perspectiva",
  player_mode: "Jugadores",
  setting: "Ambientación",
  sport: "Deportes",
  technical: "Técnico",
  theme: "Temas",
  visual: "Visual",
  general: "General",
};

const OFFICIAL_TAXONOMY_OPTIONS: Pick<SeriesTaxonomyOptions, "genres" | "facets"> = {
  genres: taxonomyData.genres
    .filter((entity) => entity.status === "approved")
    .map((entity) => ({
      slug: entity.slug,
      name: entity.name,
      count: null,
      family: "general",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "es", { numeric: true })),
  facets: [...taxonomyData.subgenres, ...taxonomyData.facets]
    .filter((entity) => entity.status === "approved")
    .map((entity) => ({
      slug: entity.slug,
      name: entity.name,
      count: null,
      family: entity.type === "subgenre" ? "subgenre" : entity.family,
    }))
    .sort((left, right) => {
      const leftFamily = left.family ?? "general";
      const rightFamily = right.family ?? "general";
      if (leftFamily === "subgenre" && rightFamily !== "subgenre") return -1;
      if (rightFamily === "subgenre" && leftFamily !== "subgenre") return 1;
      return leftFamily.localeCompare(rightFamily, "es", { numeric: true }) || left.name.localeCompare(right.name, "es", { numeric: true });
    }),
};

function regionLabel(region: string): string {
  if (region === "PAL España") return "ES";
  if (region === "PAL Europa") return "EU";
  if (region === "NTSC USA") return "USA";
  if (region === "NTSC-J Japón") return "JP";
  return region;
}

function gameSubtitle(game: AdminSeriesGameRow): string {
  const parts = [
    game.platformSlug.toUpperCase(),
    regionLabel(game.region),
    game.year ? String(game.year) : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function normalizeOptionSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function mergeLabelOptions(...groups: LabelOption[][]): LabelOption[] {
  const map = new Map<string, LabelOption>();
  for (const group of groups) {
    for (const option of group) {
      const slug = option.slug || normalizeOptionSearch(option.name).replace(/\s+/g, "-");
      if (!map.has(slug)) map.set(slug, { ...option, slug });
    }
  }
  return [...map.values()].sort((left, right) => left.name.localeCompare(right.name, "es", { numeric: true }));
}

function LabelAutocomplete({
  title,
  placeholder,
  options,
  selected,
  onChange,
  onOpenLibrary,
}: {
  title: string;
  placeholder: string;
  options: LabelOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  onOpenLibrary: () => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleOptions = useMemo(() => {
    const normalizedQuery = normalizeOptionSearch(query);
    return options
      .filter((option) => {
        if (selectedSet.has(option.name)) return false;
        if (!normalizedQuery) return true;
        const haystack = normalizeOptionSearch(`${option.name} ${option.family ?? ""}`);
        return haystack.includes(normalizedQuery) || haystack.split(/\s+/).some((word) => word.startsWith(normalizedQuery));
      })
      .slice(0, normalizedQuery ? 12 : 18);
  }, [options, query, selectedSet]);

  function addOption(name: string) {
    if (selectedSet.has(name)) return;
    onChange([...selected, name].sort((left, right) => left.localeCompare(right, "es", { numeric: true })));
    setQuery("");
  }

  function removeOption(name: string) {
    onChange(selected.filter((item) => item !== name));
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted">
          {title}
          <button
            type="button"
            className="rounded-full border border-indigo-300/50 bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-800 transition hover:bg-indigo-500/15 dark:text-indigo-200"
            onClick={onOpenLibrary}
          >
            Ver todas
          </button>
        </span>
        <input
          className="input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && visibleOptions[0]) {
              event.preventDefault();
              addOption(visibleOptions[0].name);
            }
          }}
          placeholder={placeholder}
        />
      </label>
      {selected.length ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((name) => (
            <button
              key={name}
              type="button"
              className="rounded-full border border-indigo-300/50 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-800 dark:border-indigo-400/30 dark:text-indigo-200"
              onClick={() => removeOption(name)}
              title="Quitar"
            >
              {name} ×
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid max-h-56 gap-1 overflow-auto rounded-2xl border border-indigo-300/40 bg-background/80 p-2 dark:border-indigo-400/25">
        {visibleOptions.length ? (
          visibleOptions.map((option) => (
            <button
              key={option.slug}
              type="button"
              className="rounded-xl px-3 py-2 text-left text-sm text-muted transition hover:bg-indigo-500/10 hover:text-foreground"
              onClick={() => addOption(option.name)}
            >
              <span className="font-semibold">{option.name}</span>
              {option.family ? <span className="ml-2 text-xs opacity-70">{option.family}</span> : null}
            </button>
          ))
        ) : (
          <p className="px-3 py-2 text-sm text-muted">
            No hay opciones con ese texto en la lista actual.
          </p>
        )}
      </div>
    </div>
  );
}

function LabelLibraryModal({
  title,
  options,
  selected,
  onChange,
  onClose,
}: {
  title: string;
  options: LabelOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeOptionSearch(query);
    return options.filter((option) => {
      if (!normalizedQuery) return true;
      const haystack = normalizeOptionSearch(`${option.name} ${option.family ?? ""}`);
      return haystack.includes(normalizedQuery) || haystack.split(/\s+/).some((word) => word.startsWith(normalizedQuery));
    });
  }, [options, query]);
  const groups = useMemo(() => {
    const map = new Map<string, LabelOption[]>();
    for (const option of filteredOptions) {
      const family = option.family ?? "general";
      map.set(family, [...(map.get(family) ?? []), option]);
    }
    return [...map.entries()].sort(([left], [right]) => {
      if (left === "subgenre") return -1;
      if (right === "subgenre") return 1;
      return (FAMILY_LABELS[left] ?? left).localeCompare(FAMILY_LABELS[right] ?? right, "es", { numeric: true });
    });
  }, [filteredOptions]);

  function toggleOption(name: string) {
    if (selectedSet.has(name)) {
      onChange(selected.filter((item) => item !== name));
      return;
    }
    onChange([...selected, name].sort((left, right) => left.localeCompare(right, "es", { numeric: true })));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[86vh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-indigo-300/40 bg-card shadow-2xl dark:border-indigo-400/20">
        <div className="shrink-0 flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-700 dark:text-indigo-300">
              Biblioteca
            </p>
            <h3 className="text-2xl font-black text-foreground">{title}</h3>
            <p className="text-sm text-muted">
              Marca opciones con un click. Se añadirán al listado y luego las aplicas de golpe.
            </p>
          </div>
          <button type="button" className="btn-secondary px-4 py-2" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filtrar dentro de la biblioteca…"
            autoFocus
          />
          {selected.length ? (
            <div className="rounded-2xl border border-indigo-300/40 bg-indigo-500/10 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Elegidas</p>
              <div className="flex flex-wrap gap-2">
                {selected.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="rounded-full border border-indigo-300/50 bg-background/70 px-3 py-1 text-xs font-semibold text-indigo-800 dark:text-indigo-200"
                    onClick={() => toggleOption(name)}
                  >
                    {name} ×
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map(([family, familyOptions]) => (
              <section
                key={family}
                className={`rounded-2xl border border-border bg-background/55 p-3 ${
                  groups.length === 1 ? "md:col-span-2" : ""
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-black uppercase tracking-wider text-foreground">
                    {FAMILY_LABELS[family] ?? family}
                  </h4>
                  <span className="text-xs text-muted">{familyOptions.length}</span>
                </div>
                <div className="grid max-h-72 gap-2 overflow-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {familyOptions.map((option) => {
                    const active = selectedSet.has(option.name);
                    return (
                      <button
                        key={option.slug}
                        type="button"
                        className={`rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition ${
                          active
                            ? "border-indigo-400 bg-indigo-500/20 text-indigo-800 dark:text-indigo-200"
                            : "border-border bg-card/70 text-muted hover:border-indigo-400/40 hover:text-foreground"
                        }`}
                        onClick={() => toggleOption(option.name)}
                      >
                        {active ? "✓ " : ""}
                        {option.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          {groups.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
              No hay opciones con ese filtro.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AdminSeriesPanel() {
  const [series, setSeries] = useState<AdminSeriesRow[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [detail, setDetail] = useState<AdminSeriesDetail | null>(null);
  const [seriesSearch, setSeriesSearch] = useState("");
  const [gameSearch, setGameSearch] = useState("");
  const [gamePlatformFilter, setGamePlatformFilter] = useState("");
  const [gameResults, setGameResults] = useState<AdminSeriesGameRow[]>([]);
  const [hiddenGameResultIds, setHiddenGameResultIds] = useState<Set<string>>(new Set());
  const [platformOptions, setPlatformOptions] = useState<AdminSeriesPlatformOption[]>([]);
  const [genreFilter, setGenreFilter] = useState("");
  const [newSeriesName, setNewSeriesName] = useState("");
  const [newSeriesSlug, setNewSeriesSlug] = useState("");
  const [taxonomyOptions, setTaxonomyOptions] = useState<SeriesTaxonomyOptions>({ genres: [], tags: [], facets: [] });
  const [bulkOperation, setBulkOperation] = useState<BulkLabelOperation>("add");
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedSubgenres, setSelectedSubgenres] = useState<string[]>([]);
  const [selectedFacets, setSelectedFacets] = useState<string[]>([]);
  const [labelPickerKind, setLabelPickerKind] = useState<LabelPickerKind | null>(null);
  const [seriesDescription, setSeriesDescription] = useState("");
  const [seriesBackgroundUrl, setSeriesBackgroundUrl] = useState("");
  const [seriesBackgroundOpacity, setSeriesBackgroundOpacity] = useState(68);
  const [seriesBackgroundSourceUrl, setSeriesBackgroundSourceUrl] = useState("");
  const [loadingSeries, setLoadingSeries] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seriesBackgroundUploading, setSeriesBackgroundUploading] = useState(false);
  const [seriesAiRunning, setSeriesAiRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const bulkEditorRef = useRef<HTMLDivElement>(null);

  const filteredGames = useMemo(() => {
    if (!detail) return [];
    if (!genreFilter) return detail.games;
    return detail.games.filter((game) =>
      game.genres.some((genre) => genre.slug === genreFilter),
    );
  }, [detail, genreFilter]);

  const visibleGameResults = useMemo(
    () => gameResults.filter((game) => !hiddenGameResultIds.has(game.id)),
    [gameResults, hiddenGameResultIds],
  );

  const selectedGameIdSet = useMemo(() => new Set(selectedGameIds), [selectedGameIds]);
  const labelOptions = useMemo(
    () => ({
      genres: mergeLabelOptions(OFFICIAL_TAXONOMY_OPTIONS.genres, taxonomyOptions.genres),
      subgenres: mergeLabelOptions(
        OFFICIAL_TAXONOMY_OPTIONS.facets.filter((option) => option.family === "subgenre"),
        taxonomyOptions.facets.filter((option) => option.family === "subgenre"),
      ),
      facets: mergeLabelOptions(
        OFFICIAL_TAXONOMY_OPTIONS.facets.filter((option) => option.family !== "subgenre"),
        taxonomyOptions.facets.filter((option) => option.family !== "subgenre"),
      ),
    }),
    [taxonomyOptions.facets, taxonomyOptions.genres],
  );
  const bulkTargetCount = selectedGameIds.length || filteredGames.length;
  const hasBulkLabels = selectedGenres.length > 0 || selectedSubgenres.length > 0 || selectedFacets.length > 0;
  const labelPickerConfig = labelPickerKind
    ? {
        genres: {
          title: "Géneros",
          options: labelOptions.genres,
          selected: selectedGenres,
          onChange: setSelectedGenres,
        },
        subgenres: {
          title: "Subgéneros",
          options: labelOptions.subgenres,
          selected: selectedSubgenres,
          onChange: setSelectedSubgenres,
        },
        facets: {
          title: "Facetas",
          options: labelOptions.facets,
          selected: selectedFacets,
          onChange: setSelectedFacets,
        },
      }[labelPickerKind]
    : null;

  useEffect(() => {
    if (!labelPickerKind) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [labelPickerKind]);

  function closeLabelPicker() {
    setLabelPickerKind(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        bulkEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function toggleSelectedGame(gameId: string) {
    setSelectedGameIds((current) =>
      current.includes(gameId) ? current.filter((id) => id !== gameId) : [...current, gameId],
    );
  }

  function selectVisibleGames() {
    setSelectedGameIds(filteredGames.map((game) => game.id));
  }

  function removeLabelFromGame(gameId: string, kind: "genre" | "tag" | "facet", name: string) {
    void patchSeries({
      action: "bulk-assign",
      operation: "remove",
      gameIds: [gameId],
      genres: kind === "genre" ? [name] : [],
      tags: kind === "tag" ? [name] : [],
      facets: kind === "facet" ? [name] : [],
    });
  }

  const loadSeries = useCallback(async (q = seriesSearch) => {
    setLoadingSeries(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/entities/series?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudieron cargar las sagas.");
        return;
      }
      const rows = (data.series ?? []) as AdminSeriesRow[];
      setSeries(rows);
      setSelectedSlug((current) => current || rows[0]?.slug || "");
    } catch {
      setError("Error de red al cargar sagas.");
    } finally {
      setLoadingSeries(false);
    }
  }, [seriesSearch]);

  const loadPlatformOptions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ mode: "game-platforms" });
      const res = await fetch(`/api/admin/entities/series?${params}`);
      const data = await res.json();
      if (res.ok) setPlatformOptions(data.platforms ?? []);
    } catch {
      setPlatformOptions([]);
    }
  }, []);

  const loadTaxonomyOptions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ mode: "taxonomy-options" });
      const res = await fetch(`/api/admin/entities/series?${params}`);
      const data = await res.json();
      if (res.ok) {
        setTaxonomyOptions({
          genres: data.genres ?? [],
          tags: data.tags ?? [],
          facets: data.facets ?? [],
        });
      }
    } catch {
      setTaxonomyOptions({ genres: [], tags: [], facets: [] });
    }
  }, []);

  const loadDetail = useCallback(async (slug: string) => {
    if (!slug) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/entities/series/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo cargar la saga.");
        setDetail(null);
        return;
      }
      const nextDetail = data.series as AdminSeriesDetail;
      setDetail(nextDetail);
      setSeriesDescription(nextDetail.series.description ?? "");
      setSeriesBackgroundUrl(nextDetail.series.backgroundImageUrl ?? "");
      setSeriesBackgroundOpacity(nextDetail.series.backgroundImageOpacity ?? 68);
      setSeriesBackgroundSourceUrl("");
      setGenreFilter("");
      setSelectedGameIds([]);
    } catch {
      setError("Error de red al cargar la saga.");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const searchGames = useCallback(async (
    q = gameSearch,
    slug = selectedSlug,
    platformSlug = gamePlatformFilter,
  ) => {
    if (q.trim().length < 2) {
      setGameResults([]);
      return;
    }
    const params = new URLSearchParams({
      mode: "games",
      q: q.trim(),
      limit: "40",
      excludeSeriesSlug: slug,
    });
    if (platformSlug) params.set("platformSlug", platformSlug);
    const res = await fetch(`/api/admin/entities/series?${params}`);
    const data = await res.json();
    if (res.ok) setGameResults(data.games ?? []);
  }, [gameSearch, selectedSlug, gamePlatformFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSeries();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadSeries]);

  useEffect(() => {
    void loadDetail(selectedSlug);
  }, [loadDetail, selectedSlug]);

  useEffect(() => {
    void loadPlatformOptions();
  }, [loadPlatformOptions]);

  useEffect(() => {
    void loadTaxonomyOptions();
  }, [loadTaxonomyOptions]);

  useEffect(() => {
    setHiddenGameResultIds(new Set());
  }, [gameSearch, gamePlatformFilter, selectedSlug]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchGames();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchGames]);

  async function createSeries(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/entities/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newSeriesName,
          slug: newSeriesSlug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear la saga.");
        return;
      }
      const created = data.series as AdminSeriesRow;
      setNewSeriesName("");
      setNewSeriesSlug("");
      setMessage(`Saga «${created.name}» creada.`);
      await loadSeries("");
      setSeriesSearch("");
      setSelectedSlug(created.slug);
    } catch {
      setError("Error de red al crear la saga.");
    } finally {
      setSaving(false);
    }
  }

  async function patchSeries(body: Record<string, unknown>) {
    if (!selectedSlug) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/entities/series/${encodeURIComponent(selectedSlug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar el cambio.");
        return;
      }
      const nextDetail = data.series as AdminSeriesDetail;
      setDetail(nextDetail);
      setSeriesDescription(nextDetail.series.description ?? "");
      setSeriesBackgroundUrl(nextDetail.series.backgroundImageUrl ?? "");
      setSeriesBackgroundOpacity(nextDetail.series.backgroundImageOpacity ?? 68);
      await loadSeries(seriesSearch);
      if (body.action === "add-game") {
        setMessage("Juego añadido a la saga.");
        const addedGameId = typeof body.gameId === "string" ? body.gameId : "";
        setGameResults((current) => current.filter((game) => game.id !== addedGameId));
      } else if (body.action === "add-games") {
        setMessage(`Añadidos ${data.addedCount ?? 0} juegos a la saga.`);
        const addedGameIds = new Set(
          Array.isArray(body.gameIds)
            ? body.gameIds.filter((gameId): gameId is string => typeof gameId === "string")
            : [],
        );
        setGameResults((current) => current.filter((game) => !addedGameIds.has(game.id)));
      } else if (body.action === "remove-game") {
        setMessage("Juego sacado de la saga.");
      } else if (body.action === "bulk-assign") {
        setMessage(`Asignación aplicada a ${data.affectedCount ?? 0} juegos.`);
        setSelectedGenres([]);
        setSelectedSubgenres([]);
        setSelectedFacets([]);
        setSelectedGameIds([]);
      } else if (body.action === "update-description") {
        setMessage("Descripción de saga guardada.");
      } else if (body.action === "update-background") {
        setMessage("Fondo de bloque guardado.");
      }
    } catch {
      setError("Error de red al guardar el cambio.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateSeriesDescription() {
    if (!selectedSlug) return;
    setSeriesAiRunning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/entities/series/${encodeURIComponent(selectedSlug)}/ai-fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: seriesDescription }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo generar la descripción de la saga.");
        return;
      }
      setSeriesDescription(data.description ?? "");
      setMessage("Descripción generada con IA. Revisa y guarda.");
    } catch {
      setError("Error de red al generar la descripción de saga.");
    } finally {
      setSeriesAiRunning(false);
    }
  }

  async function saveSeriesDescription() {
    await patchSeries({
      action: "update-description",
      description: seriesDescription,
    });
  }

  async function saveSeriesBackgroundUrl() {
    await patchSeries({
      action: "update-background",
      backgroundImageUrl: seriesBackgroundUrl,
      backgroundImageOpacity: seriesBackgroundOpacity,
    });
  }

  async function importSeriesBackgroundFromUrl() {
    if (!selectedSlug || !seriesBackgroundSourceUrl.trim()) return;
    setSeriesBackgroundUploading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/entities/series/${encodeURIComponent(selectedSlug)}/background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: seriesBackgroundSourceUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo importar el fondo.");
        return;
      }
      const nextDetail = data.series as AdminSeriesDetail;
      setDetail(nextDetail);
      setSeriesBackgroundUrl(data.backgroundImageUrl ?? nextDetail.series.backgroundImageUrl ?? "");
      setSeriesBackgroundOpacity(nextDetail.series.backgroundImageOpacity ?? 68);
      setSeriesBackgroundSourceUrl("");
      await loadSeries(seriesSearch);
      setMessage("Fondo importado al hosting y guardado.");
    } catch {
      setError("Error de red al importar el fondo.");
    } finally {
      setSeriesBackgroundUploading(false);
    }
  }

  async function uploadSeriesBackgroundFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!selectedSlug || !file) return;
    setSeriesBackgroundUploading(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/admin/entities/series/${encodeURIComponent(selectedSlug)}/background`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo subir el fondo.");
        return;
      }
      const nextDetail = data.series as AdminSeriesDetail;
      setDetail(nextDetail);
      setSeriesBackgroundUrl(data.backgroundImageUrl ?? nextDetail.series.backgroundImageUrl ?? "");
      setSeriesBackgroundOpacity(nextDetail.series.backgroundImageOpacity ?? 68);
      await loadSeries(seriesSearch);
      setMessage("Fondo subido al hosting y guardado.");
    } catch {
      setError("Error de red al subir el fondo.");
    } finally {
      setSeriesBackgroundUploading(false);
    }
  }

  function hideGameResult(gameId: string) {
    setHiddenGameResultIds((current) => new Set([...current, gameId]));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(280px,360px)_1fr]">
      <div className="space-y-6">
        <Panel className="border-amber-300/40 bg-amber-50/40 dark:border-amber-400/20 dark:bg-amber-950/10">
          <PanelTitle eyebrow="Sagas">Crear saga</PanelTitle>
          <form onSubmit={createSeries} className="grid gap-3">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Nombre</span>
              <input
                required
                className="input"
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
                placeholder="Final Fantasy"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Slug</span>
              <input
                className="input font-mono text-xs"
                value={newSeriesSlug}
                onChange={(e) => setNewSeriesSlug(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Creando…" : "Crear saga"}
            </button>
          </form>
        </Panel>

        <Panel className="border-sky-300/40 bg-sky-50/40 dark:border-sky-400/20 dark:bg-sky-950/10">
          <PanelTitle eyebrow="Buscar">Seleccionar saga</PanelTitle>
          <input
            className="input mb-3"
            value={seriesSearch}
            onChange={(e) => setSeriesSearch(e.target.value)}
            placeholder="Buscar saga…"
          />
          {loadingSeries ? (
            <p className="text-sm text-muted">Cargando sagas…</p>
          ) : (
            <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
              {series.map((item) => (
                <button
                  key={item.slug}
                  type="button"
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    selectedSlug === item.slug
                      ? "border-accent bg-accent/10"
                      : "border-border bg-background/45 hover:border-accent/40"
                  }`}
                  onClick={() => setSelectedSlug(item.slug)}
                >
                  <div className="font-semibold text-foreground">{item.name}</div>
                  <div className="text-xs text-muted">
                    {item.slug} · {item.gameCount} juegos
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        {error && (
          <AdminNotice tone="danger">{error}</AdminNotice>
        )}
        {message && (
          <AdminNotice tone="status">{message}</AdminNotice>
        )}

        <Panel>
          {loadingDetail ? (
            <p className="text-sm text-muted">Cargando saga…</p>
          ) : detail ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <PanelTitle eyebrow="Gestión de saga">{detail.series.name}</PanelTitle>
                  <p className="text-sm text-muted">
                    {detail.series.gameCount} juegos ordenados manualmente en esta saga.
                  </p>
                </div>
                <Link href={`/saga/${detail.series.slug}`} target="_blank" className="btn-secondary">
                  Ver página pública
                </Link>
              </div>

              <AdminFunctionCard tone="edit">
                <AdminFunctionHeader
                  tone="edit"
                  title="Descripción de la saga"
                  description={
                    <>
                      Se muestra en la página pública. Puedes editarla a mano o regenerarla con IA.
                      {detail.series.description ? (
                        <span className="mt-1 block font-semibold text-emerald-700 dark:text-emerald-300">
                          Descripción actual cargada en el editor.
                        </span>
                      ) : null}
                    </>
                  }
                  action={
                  <button
                    type="button"
                    className="rounded-full border border-violet-300/60 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-800 transition hover:bg-violet-500/15 disabled:opacity-50 dark:text-violet-200"
                    disabled={seriesAiRunning || saving}
                    onClick={() => void regenerateSeriesDescription()}
                    title="Regenerar descripción con IA"
                  >
                    {seriesAiRunning ? "✦ IA trabajando…" : "✦ IA"}
                  </button>
                  }
                />
                <textarea
                  className="input min-h-36 leading-7"
                  value={seriesDescription}
                  onChange={(event) => setSeriesDescription(event.target.value)}
                  placeholder="Descripción editorial de la saga…"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={saving || seriesAiRunning}
                    onClick={() => void saveSeriesDescription()}
                  >
                    {saving ? "Guardando…" : "Guardar descripción"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={saving || seriesAiRunning}
                    onClick={() => setSeriesDescription(detail.series.description ?? "")}
                  >
                    Restaurar actual
                  </button>
                </div>
              </AdminFunctionCard>

              <AdminFunctionCard tone="media">
                <AdminFunctionHeader
                  tone="media"
                  title="Fondo del bloque público"
                  description="Se muestra solo dentro del bloque principal de la saga. Puedes pegar una URL, importarla al hosting o subir una imagen desde tu Mac."
                />
                {seriesBackgroundUrl ? (
                  <div className="relative mb-4 min-h-36 overflow-hidden rounded-3xl border border-border p-4">
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${seriesBackgroundUrl})`,
                        opacity: seriesBackgroundOpacity / 100,
                      }}
                    />
                    <div className="relative inline-flex rounded-2xl bg-background/80 px-3 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur">
                      Fondo actual cargado
                    </div>
                  </div>
                ) : (
                  <p className="mb-4 rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
                    Esta saga todavía no tiene fondo propio. Si no guardas uno, solo algunas sagas de prueba usan imagen fija.
                  </p>
                )}
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted">URL guardada</span>
                    <input
                      className="input"
                      value={seriesBackgroundUrl}
                      onChange={(event) => setSeriesBackgroundUrl(event.target.value)}
                      placeholder="https://... o /saga-backgrounds/..."
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="btn-primary w-full lg:w-auto"
                      disabled={saving || seriesBackgroundUploading}
                      onClick={() => void saveSeriesBackgroundUrl()}
                    >
                      Guardar fondo
                    </button>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-border bg-background/50 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-[10px] uppercase tracking-wider text-muted">
                      Intensidad de imagen
                    </span>
                    <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <input
                        className="input w-24 px-3 py-2 text-center"
                        type="number"
                        min={1}
                        max={100}
                        value={seriesBackgroundOpacity}
                        onChange={(event) =>
                          setSeriesBackgroundOpacity(
                            Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                          )
                        }
                      />
                      %
                    </label>
                  </div>
                  <input
                    className="w-full accent-amber-500"
                    type="range"
                    min={1}
                    max={100}
                    value={seriesBackgroundOpacity}
                    onChange={(event) => setSeriesBackgroundOpacity(Number(event.target.value))}
                  />
                  <p className="mt-2 text-xs text-muted">
                    Base recomendada: 68%. Sube si queda apagada; baja si tapa el texto.
                  </p>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Importar desde URL al hosting</span>
                    <input
                      className="input"
                      value={seriesBackgroundSourceUrl}
                      onChange={(event) => setSeriesBackgroundSourceUrl(event.target.value)}
                      placeholder="URL de imagen externa para descargar y guardar"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      className="btn-secondary w-full lg:w-auto"
                      disabled={seriesBackgroundUploading || !seriesBackgroundSourceUrl.trim()}
                      onClick={() => void importSeriesBackgroundFromUrl()}
                    >
                      {seriesBackgroundUploading ? "Trabajando…" : "Importar"}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="btn-secondary cursor-pointer">
                    Subir imagen desde Mac
                    <input
                      className="hidden"
                      type="file"
                      accept="image/*"
                      disabled={seriesBackgroundUploading}
                      onChange={(event) => void uploadSeriesBackgroundFile(event)}
                    />
                  </label>
                  {seriesBackgroundUrl ? (
                    <button
                      type="button"
                      className="rounded-xl border border-rose-300/50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-200"
                      disabled={saving || seriesBackgroundUploading}
                      onClick={() => {
                        setSeriesBackgroundUrl("");
                        void patchSeries({ action: "update-background", backgroundImageUrl: "" });
                      }}
                    >
                      Quitar fondo
                    </button>
                  ) : null}
                </div>
              </AdminFunctionCard>

              <AdminFunctionCard tone="search">
                <AdminFunctionHeader
                  tone="search"
                  title="Añadir juegos"
                  description="Busca en el catálogo y añade resultados a esta saga."
                />
                <div className="grid gap-3 md:grid-cols-[1fr_260px]">
                  <input
                    className="input"
                    value={gameSearch}
                    onChange={(e) => setGameSearch(e.target.value)}
                    placeholder="Buscar por título, referencia, compañía o género…"
                  />
                  <select
                    className="input"
                    value={gamePlatformFilter}
                    onChange={(e) => setGamePlatformFilter(e.target.value)}
                  >
                    <option value="">Todas las plataformas</option>
                    {platformOptions.map((platform) => (
                      <option key={platform.slug} value={platform.slug}>
                        {platform.name} ({platform.count})
                      </option>
                    ))}
                  </select>
                </div>
                {visibleGameResults.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-3">
                      <p className="text-sm text-muted">
                        {visibleGameResults.length} resultados visibles. Quita de la vista los que no quieras y añade el resto de golpe.
                      </p>
                      <button
                        type="button"
                        className="btn-primary px-3 py-2 text-xs"
                        disabled={saving}
                        onClick={() =>
                          void patchSeries({
                            action: "add-games",
                            gameIds: visibleGameResults.map((game) => game.id),
                          })
                        }
                      >
                        Añadir visibles
                      </button>
                    </div>
                    {visibleGameResults.map((game) => (
                      <div
                        key={game.id}
                        className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/70 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">{game.title}</div>
                          <div className="text-xs text-muted">{gameSubtitle(game)}</div>
                        </div>
                        <button
                          type="button"
                          className="btn-primary px-3 py-2 text-xs"
                          disabled={saving}
                          onClick={() => void patchSeries({ action: "add-game", gameId: game.id })}
                        >
                          Añadir
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted transition hover:border-amber-400/40 hover:text-foreground disabled:opacity-50"
                          disabled={saving}
                          onClick={() => hideGameResult(game.id)}
                        >
                          Quitar de vista
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {gameResults.length > 0 && visibleGameResults.length === 0 && (
                  <p className="mt-3 rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
                    Has quitado todos los resultados visibles. Cambia la búsqueda o la plataforma para volver a cargar.
                  </p>
                )}
              </AdminFunctionCard>

              <AdminFunctionCard tone="neutral">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted">
                    Filtra por género
                  </p>
                  <select
                    className="input w-full md:w-72"
                    value={genreFilter}
                    onChange={(e) => {
                      setGenreFilter(e.target.value);
                      setSelectedGameIds([]);
                    }}
                  >
                    <option value="">Todos los géneros ({detail.games.length})</option>
                    {detail.genreOptions.map((genre) => (
                      <option key={genre.slug} value={genre.slug}>
                        {genre.name} ({genre.count})
                      </option>
                    ))}
                  </select>
                </div>

                <div ref={bulkEditorRef}>
                <AdminFunctionCard tone="bulk" className="mb-4">
                  <AdminFunctionHeader
                    tone="bulk"
                    title="Gestionar géneros, subgéneros y facetas"
                    description={
                      selectedGameIds.length
                        ? `Se aplicará solo a ${selectedGameIds.length} juegos marcados.`
                        : `Se aplicará a los ${filteredGames.length} juegos visibles con el filtro actual.`
                    }
                  />
                  <label className="mb-3 block space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted">Acción</span>
                    <select
                      className="input"
                      value={bulkOperation}
                      onChange={(event) => setBulkOperation(event.target.value as BulkLabelOperation)}
                    >
                      <option value="add">Añadir a lo que ya tienen</option>
                      <option value="remove">Quitar de esos juegos</option>
                      <option value="replace">Reemplazar y dejar solo lo elegido</option>
                    </select>
                  </label>
                  <div className="grid gap-3 md:grid-cols-3">
                    <LabelAutocomplete
                      title="Géneros"
                      placeholder="Escribe y elige un género…"
                      options={labelOptions.genres}
                      selected={selectedGenres}
                      onChange={setSelectedGenres}
                      onOpenLibrary={() => setLabelPickerKind("genres")}
                    />
                    <LabelAutocomplete
                      title="Subgéneros"
                      placeholder="Escribe y elige un subgénero…"
                      options={labelOptions.subgenres}
                      selected={selectedSubgenres}
                      onChange={setSelectedSubgenres}
                      onOpenLibrary={() => setLabelPickerKind("subgenres")}
                    />
                    <LabelAutocomplete
                      title="Facetas"
                      placeholder="Escribe y elige una faceta…"
                      options={labelOptions.facets}
                      selected={selectedFacets}
                      onChange={setSelectedFacets}
                      onOpenLibrary={() => setLabelPickerKind("facets")}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn-primary mt-4"
                    disabled={saving || bulkTargetCount === 0 || !hasBulkLabels}
                    onClick={() =>
                      void patchSeries({
                        action: "bulk-assign",
                        operation: bulkOperation,
                        genreSlug: genreFilter || null,
                        gameIds: selectedGameIds,
                        genres: selectedGenres,
                        tags: [],
                        facets: [...selectedSubgenres, ...selectedFacets],
                      })
                    }
                  >
                    {saving
                      ? "Aplicando…"
                      : selectedGameIds.length
                        ? `Aplicar a ${selectedGameIds.length} juegos marcados`
                        : "Aplicar a los juegos filtrados"}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button type="button" className="btn-secondary px-3 py-1.5" onClick={selectVisibleGames} disabled={filteredGames.length === 0}>
                      Marcar visibles
                    </button>
                    <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setSelectedGameIds([])} disabled={selectedGameIds.length === 0}>
                      Limpiar marcados
                    </button>
                  </div>
                </AdminFunctionCard>
                </div>

                <div className="grid gap-2">
                  {filteredGames.map((game) => (
                    <div
                      key={game.id}
                      className="grid gap-3 rounded-2xl border border-border bg-card/70 p-3 md:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-border"
                            checked={selectedGameIdSet.has(game.id)}
                            onChange={() => toggleSelectedGame(game.id)}
                          />
                          <span className="min-w-0">
                            <span className="block font-semibold text-foreground">{game.title}</span>
                            <span className="mt-1 block text-xs text-muted">{gameSubtitle(game)}</span>
                          </span>
                        </label>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {game.genres.slice(0, 5).map((genre) => (
                            <button
                              key={genre.slug}
                              type="button"
                              className="rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs font-medium text-muted transition hover:border-rose-400/40 hover:text-rose-600 disabled:opacity-50"
                              disabled={saving}
                              onClick={() => removeLabelFromGame(game.id, "genre", genre.name)}
                              title={`Quitar ${genre.name}`}
                            >
                              {genre.name} ×
                            </button>
                          ))}
                          {game.tags.map((tag) => (
                            <button
                              key={`tag-${tag.slug}`}
                              type="button"
                              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:border-rose-400/40 hover:text-rose-600 disabled:opacity-50 dark:text-emerald-300"
                              disabled={saving}
                              onClick={() => removeLabelFromGame(game.id, "tag", tag.name)}
                              title={`Quitar ${tag.name}`}
                            >
                              {tag.name} ×
                            </button>
                          ))}
                          {game.facets.map((facet) => (
                            <button
                              key={`facet-${facet.slug}`}
                              type="button"
                              className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:border-rose-400/40 hover:text-rose-600 disabled:opacity-50 dark:text-amber-300"
                              disabled={saving}
                              onClick={() => removeLabelFromGame(game.id, "facet", facet.name)}
                              title={`Quitar ${facet.name}`}
                            >
                              {facet.name} ×
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-xl border border-rose-400/40 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                        disabled={saving}
                        onClick={() => void patchSeries({ action: "remove-game", gameId: game.id })}
                      >
                        Sacar de la saga
                      </button>
                    </div>
                  ))}
                  {filteredGames.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
                      No hay juegos con este filtro.
                    </p>
                  )}
                </div>
              </AdminFunctionCard>
              {labelPickerConfig ? (
                <LabelLibraryModal
                  title={labelPickerConfig.title}
                  options={labelPickerConfig.options}
                  selected={labelPickerConfig.selected}
                  onChange={labelPickerConfig.onChange}
                  onClose={closeLabelPicker}
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">Selecciona una saga para editarla.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

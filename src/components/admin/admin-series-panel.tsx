"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminFunctionCard, AdminFunctionHeader, AdminNotice } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type {
  AdminSeriesDetail,
  AdminSeriesGameRow,
  AdminSeriesPlatformOption,
  AdminSeriesRow,
} from "@/lib/admin-series-manager";

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
  const parts = [
    game.platformSlug.toUpperCase(),
    regionLabel(game.region),
    game.year ? String(game.year) : null,
  ].filter(Boolean);
  return parts.join(" · ");
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
  const [tagsInput, setTagsInput] = useState("");
  const [facetsInput, setFacetsInput] = useState("");
  const [seriesDescription, setSeriesDescription] = useState("");
  const [loadingSeries, setLoadingSeries] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seriesAiRunning, setSeriesAiRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      setGenreFilter("");
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
      } else if (body.action === "update-description") {
        setMessage("Descripción de saga guardada.");
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
                    onChange={(e) => setGenreFilter(e.target.value)}
                  >
                    <option value="">Todos los géneros ({detail.games.length})</option>
                    {detail.genreOptions.map((genre) => (
                      <option key={genre.slug} value={genre.slug}>
                        {genre.name} ({genre.count})
                      </option>
                    ))}
                  </select>
                </div>

                <AdminFunctionCard tone="bulk" className="mb-4">
                  <AdminFunctionHeader
                    tone="bulk"
                    title="Aplicar facetas y etiquetas en lote"
                    description={`Se aplicará solo a los ${filteredGames.length} juegos visibles con el filtro actual.`}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        Etiquetas
                      </span>
                      <input
                        className="input"
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        placeholder="soulslike, cooperativo, mundo abierto…"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted">
                        Facetas
                      </span>
                      <input
                        className="input"
                        value={facetsInput}
                        onChange={(e) => setFacetsInput(e.target.value)}
                        placeholder="Edición física, edición GOTY…"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn-primary mt-4"
                    disabled={saving || filteredGames.length === 0}
                    onClick={() =>
                      void patchSeries({
                        action: "bulk-assign",
                        genreSlug: genreFilter || null,
                        tags: parseCsv(tagsInput),
                        facets: parseCsv(facetsInput),
                      })
                    }
                  >
                    {saving ? "Aplicando…" : "Aplicar a los juegos filtrados"}
                  </button>
                </AdminFunctionCard>

                <div className="grid gap-2">
                  {filteredGames.map((game) => (
                    <div
                      key={game.id}
                      className="grid gap-3 rounded-2xl border border-border bg-card/70 p-3 md:grid-cols-[1fr_auto]"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">{game.title}</div>
                        <div className="mt-1 text-xs text-muted">{gameSubtitle(game)}</div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {game.genres.slice(0, 5).map((genre) => (
                            <Badge key={genre.slug} tone="neutral">
                              {genre.name}
                            </Badge>
                          ))}
                          {game.tags.map((tag) => (
                            <Badge key={`tag-${tag.slug}`} tone="green">
                              {tag.name}
                            </Badge>
                          ))}
                          {game.facets.map((facet) => (
                            <Badge key={`facet-${facet.slug}`} tone="amber">
                              {facet.name}
                            </Badge>
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
            </div>
          ) : (
            <p className="text-sm text-muted">Selecciona una saga para editarla.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

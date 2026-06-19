"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNotice, AdminStatTile, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type {
  AdminFacetCoverage,
  AdminFacetReviewGame,
  AdminFacetReviewSummary,
} from "@/lib/admin-facet-review";

type Option = { slug: string; name: string };

type ReviewResponse = {
  ok: boolean;
  summary: AdminFacetReviewSummary;
  coverage: AdminFacetCoverage;
  options: {
    subgenres: Option[];
    facets: Option[];
  };
  games: AdminFacetReviewGame[];
};

const emptySummary: AdminFacetReviewSummary = {
  totalGames: 0,
  withSubgenres: 0,
  withFacets: 0,
  complete: 0,
  empty: 0,
  withSuggestions: 0,
};

const emptyCoverage: AdminFacetCoverage = {
  platforms: [],
  topSubgenres: [],
  topFacets: [],
};

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusLabel(status: AdminFacetReviewGame["status"]): string {
  if (status === "complete") return "Completa";
  if (status === "missing-subgenres") return "Sin subgénero";
  if (status === "missing-facets") return "Sin facetas";
  return "Vacía";
}

function percent(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function optionLabel(option: Option): string {
  return option.name;
}

export function AdminFacetReviewPanel() {
  const [summary, setSummary] = useState<AdminFacetReviewSummary>(emptySummary);
  const [coverage, setCoverage] = useState<AdminFacetCoverage>(emptyCoverage);
  const [subgenreOptions, setSubgenreOptions] = useState<Option[]>([]);
  const [facetOptions, setFacetOptions] = useState<Option[]>([]);
  const [games, setGames] = useState<AdminFacetReviewGame[]>([]);
  const [selection, setSelection] = useState<AdminFacetReviewGame[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("empty");
  const [subgenresInput, setSubgenresInput] = useState("");
  const [facetsInput, setFacetsInput] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedIds = useMemo(() => new Set(selection.map((game) => game.id)), [selection]);
  const visibleGames = useMemo(() => games.filter((game) => !selectedIds.has(game.id)), [games, selectedIds]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/facet-review?${params}`);
      const data = (await res.json()) as ReviewResponse | { error?: string };
      if (!res.ok || !("summary" in data)) {
        setError(("error" in data ? data.error : null) ?? "No se pudo cargar la revisión.");
        return;
      }
      setSummary(data.summary);
      setCoverage(data.coverage);
      setSubgenreOptions(data.options.subgenres);
      setFacetOptions(data.options.facets);
      setGames(data.games);
    } catch {
      setError("Error de red al cargar la revisión.");
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  function addToSelection(items: AdminFacetReviewGame[]) {
    setSelection((current) => {
      const map = new Map(current.map((game) => [game.id, game]));
      for (const game of items) map.set(game.id, game);
      return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, "es", { numeric: true }));
    });
  }

  function removeFromSelection(gameId: string) {
    setSelection((current) => current.filter((game) => game.id !== gameId));
  }

  function useSuggestions(game: AdminFacetReviewGame) {
    setSubgenresInput(game.suggestedSubgenres.map((entity) => entity.name).join(", "));
    setFacetsInput(game.suggestedFacets.map((entity) => entity.name).join(", "));
    addToSelection([game]);
  }

  async function applyReview() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/facet-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameIds: selection.map((game) => game.id),
          subgenres: parseCsv(subgenresInput),
          facets: parseCsv(facetsInput),
          mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo aplicar la revisión.");
        return;
      }
      setMessage(`Facetas aplicadas a ${data.affectedCount ?? 0} juegos.`);
      setSelection([]);
      setSubgenresInput("");
      setFacetsInput("");
      await load();
    } catch {
      setError("Error de red al aplicar la revisión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel className={adminToneClass("bulk")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <PanelTitle eyebrow="Facetas">Revisión y aplicación</PanelTitle>
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Revisa huecos de clasificación, acepta sugerencias derivadas de etiquetas existentes y aplica solo entidades de la taxonomía controlada.
            </p>
          </div>
          <Link href="/admin/taxonomia" className="btn-secondary w-full lg:w-auto">
            Ver taxonomía
          </Link>
        </div>
      </Panel>

      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
      {message && <AdminNotice tone="status">{message}</AdminNotice>}

      <div className="grid gap-3 md:grid-cols-5">
        <AdminStatTile tone="bulk" label="Subgéneros" value={percent(summary.withSubgenres, summary.totalGames)} />
        <AdminStatTile tone="bulk" label="Facetas" value={percent(summary.withFacets, summary.totalGames)} />
        <AdminStatTile tone="status" label="Completas" value={summary.complete.toLocaleString("es-ES")} />
        <AdminStatTile tone="danger" label="Vacías" value={summary.empty.toLocaleString("es-ES")} />
        <AdminStatTile tone="ai" label="Sugerencias" value={summary.withSuggestions.toLocaleString("es-ES")} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)_minmax(320px,0.8fr)]">
        <Panel className={adminToneClass("status")}>
          <PanelTitle eyebrow="Cobertura">Plataformas principales</PanelTitle>
          <div className="space-y-2">
            {coverage.platforms.map((item) => (
              <div key={item.platformSlug} className="grid grid-cols-[90px_1fr_64px] items-center gap-3 text-sm">
                <span className="font-semibold uppercase text-foreground">{item.platformSlug}</span>
                <div className="h-2 overflow-hidden rounded-full bg-card-hover">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: percent(item.complete, item.totalGames) }}
                  />
                </div>
                <span className="text-right text-xs text-muted">{percent(item.complete, item.totalGames)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className={adminToneClass("bulk")}>
          <PanelTitle eyebrow="Top">Subgéneros</PanelTitle>
          <div className="flex flex-wrap gap-1.5">
            {coverage.topSubgenres.map((entity) => (
              <Badge key={entity.slug} tone="violet">{entity.name} · {entity.count}</Badge>
            ))}
            {coverage.topSubgenres.length === 0 && <p className="text-sm text-muted">Sin datos todavía.</p>}
          </div>
        </Panel>

        <Panel className={adminToneClass("edit")}>
          <PanelTitle eyebrow="Top">Facetas</PanelTitle>
          <div className="flex flex-wrap gap-1.5">
            {coverage.topFacets.map((entity) => (
              <Badge key={entity.slug} tone="amber">{entity.name} · {entity.count}</Badge>
            ))}
            {coverage.topFacets.length === 0 && <p className="text-sm text-muted">Sin datos todavía.</p>}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)]">
        <Panel className={adminToneClass("search")}>
          <PanelTitle eyebrow="Cola">Juegos para revisar</PanelTitle>
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Buscar</span>
              <input
                className="input"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Título, id, plataforma, género…"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Estado</span>
              <select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos</option>
                <option value="empty">Vacías</option>
                <option value="missing-subgenres">Sin subgénero</option>
                <option value="missing-facets">Sin facetas</option>
                <option value="suggestions">Con sugerencias</option>
                <option value="complete">Completas</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={() => addToSelection(visibleGames)} disabled={visibleGames.length === 0}>
              Añadir visibles
            </button>
            <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
              {loading ? "Cargando…" : "Actualizar"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {visibleGames.map((game) => (
              <article key={game.id} className="rounded-2xl border border-border bg-background/45 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{game.title}</h3>
                      <Badge tone={game.status === "complete" ? "green" : game.status === "empty" ? "rose" : "amber"}>
                        {statusLabel(game.status)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {game.platformSlug.toUpperCase()} · {game.region} · {game.year ?? "s/f"} · {game.id}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {game.genres.slice(0, 4).map((entity) => <Badge key={`genre-${entity.slug}`}>{entity.name}</Badge>)}
                      {game.subgenres.map((entity) => <Badge key={`subgenre-${entity.slug}`} tone="violet">{entity.name}</Badge>)}
                      {game.facets.slice(0, 5).map((entity) => <Badge key={`facet-${entity.slug}`} tone="amber">{entity.name}</Badge>)}
                    </div>
                    {(game.suggestedSubgenres.length > 0 || game.suggestedFacets.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[...game.suggestedSubgenres, ...game.suggestedFacets].map((entity) => (
                          <Badge key={`suggestion-${entity.slug}`} tone="green">{entity.name}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {(game.suggestedSubgenres.length > 0 || game.suggestedFacets.length > 0) && (
                      <button type="button" className="btn-secondary" onClick={() => useSuggestions(game)}>
                        Usar sugerencias
                      </button>
                    )}
                    <button type="button" className="btn-primary" onClick={() => addToSelection([game])}>
                      Añadir
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {visibleGames.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
                No hay juegos para este filtro.
              </p>
            )}
          </div>
        </Panel>

        <Panel className={`${adminToneClass("bulk")} xl:sticky xl:top-24 xl:self-start`}>
          <PanelTitle eyebrow="Aplicar">Selección revisada</PanelTitle>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Subgéneros controlados</span>
              <input
                className="input"
                value={subgenresInput}
                onChange={(event) => setSubgenresInput(event.target.value)}
                placeholder={subgenreOptions.slice(0, 3).map(optionLabel).join(", ")}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Facetas controladas</span>
              <input
                className="input"
                value={facetsInput}
                onChange={(event) => setFacetsInput(event.target.value)}
                placeholder={facetOptions.slice(0, 3).map(optionLabel).join(", ")}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Modo</span>
              <select className="input" value={mode} onChange={(event) => setMode(event.target.value === "replace" ? "replace" : "append")}>
                <option value="append">Añadir sin borrar lo existente</option>
                <option value="replace">Reemplazar subgéneros/facetas</option>
              </select>
            </label>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={saving || selection.length === 0}
              onClick={() => void applyReview()}
            >
              {saving ? "Aplicando…" : `Aplicar a ${selection.length} juegos`}
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {selection.map((game) => (
              <div key={game.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/45 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{game.title}</p>
                  <p className="text-[11px] text-muted">{game.platformSlug.toUpperCase()} · {game.id}</p>
                </div>
                <button type="button" className="btn-secondary" onClick={() => removeFromSelection(game.id)}>
                  Quitar
                </button>
              </div>
            ))}
            {selection.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
                Añade juegos desde la cola para aplicar cambios.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

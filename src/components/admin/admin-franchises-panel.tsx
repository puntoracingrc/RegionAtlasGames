"use client";

import Link from "next/link";
import { ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdminFunctionCard, AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import type { AdminFranchiseDetail, AdminFranchiseRow } from "@/lib/admin-franchise-manager";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "@/lib/franchise-types";
import {
  FRANCHISE_ENTITY_LABELS,
  FRANCHISE_MEMBERSHIP_LABELS,
  FRANCHISE_RELATIONSHIP_LABELS,
  FRANCHISE_ROLE_LABELS,
  FRANCHISE_ROLE_OPTIONS,
} from "@/lib/franchise-labels";
import type { FranchiseRole, RelationshipEntityType, RelationshipType } from "@/lib/franchise-types";

type SeriesOption = { slug: string; name: string; gameCount: number };

export function AdminFranchisesPanel() {
  const [franchises, setFranchises] = useState<AdminFranchiseRow[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [detail, setDetail] = useState<AdminFranchiseDetail | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<"draft" | "published">("draft");
  const [seriesSlug, setSeriesSlug] = useState("");
  const [seriesPrimary, setSeriesPrimary] = useState(true);
  const [gameId, setGameId] = useState("");
  const [gamePrimary, setGamePrimary] = useState(false);
  const [gameRole, setGameRole] = useState<FranchiseRole | "">("");
  const [sourceType, setSourceType] = useState<RelationshipEntityType>("franchise");
  const [sourceId, setSourceId] = useState("");
  const [targetType, setTargetType] = useState<RelationshipEntityType>("game");
  const [targetId, setTargetId] = useState("");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>("derived_from");

  const visibleFranchises = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("es");
    return franchises.filter((franchise) =>
      !q || franchise.name.toLocaleLowerCase("es").includes(q) || franchise.slug.includes(q));
  }, [franchises, search]);

  const loadList = useCallback(async () => {
    const response = await fetch("/api/admin/entities/franchises");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar las franquicias.");
    setFranchises(data.franchises ?? []);
  }, []);

  const loadSeriesOptions = useCallback(async () => {
    const response = await fetch("/api/admin/entities/franchises?mode=series-options");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar las sagas.");
    setSeriesOptions(data.series ?? []);
  }, []);

  const loadDetail = useCallback(async (slug: string) => {
    if (!slug) {
      setDetail(null);
      return;
    }
    const response = await fetch(`/api/admin/entities/franchises/${encodeURIComponent(slug)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No se pudo cargar la franquicia.");
    const next = data.franchise as AdminFranchiseDetail;
    setDetail(next);
    setEditName(next.franchise.name);
    setEditDescription(next.franchise.description ?? "");
    setEditStatus(next.franchise.status);
    setSourceType("franchise");
    setSourceId(next.franchise.id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Both loaders update state only after their requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.all([loadList(), loadSeriesOptions()])
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo cargar la administración.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadList, loadSeriesOptions]);

  useEffect(() => {
    if (!selectedSlug) return;
    // The loader updates state only after its request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDetail(selectedSlug).catch((reason) =>
      setError(reason instanceof Error ? reason.message : "No se pudo cargar la franquicia."));
  }, [loadDetail, selectedSlug]);

  async function refresh(messageText?: string) {
    await loadList();
    await loadDetail(selectedSlug);
    if (messageText) setMessage(messageText);
  }

  async function patchSelected(body: Record<string, unknown>, messageText: string) {
    if (!selectedSlug) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/entities/franchises/${encodeURIComponent(selectedSlug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar el cambio.");
      await refresh(messageText);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el cambio.");
    } finally {
      setSaving(false);
    }
  }

  async function createFranchise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/entities/franchises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, slug: newSlug, description: newDescription }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo crear la franquicia.");
      setNewName("");
      setNewSlug("");
      setNewDescription("");
      await loadList();
      setSelectedSlug(data.franchise.franchise.slug);
      setMessage("Franquicia creada como borrador.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo crear la franquicia.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(290px,380px)_minmax(0,1fr)]">
      <div className="space-y-6">
        <Panel className={adminToneClass("edit")}>
          <PanelTitle eyebrow="Alta segura">Nueva franquicia</PanelTitle>
          <form onSubmit={createFranchise} className="grid gap-3">
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Nombre</span>
              <input className="input" required value={newName} onChange={(event) => setNewName(event.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Slug estable</span>
              <input className="input font-mono text-xs" value={newSlug} onChange={(event) => setNewSlug(event.target.value)} placeholder="Opcional" />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Perfil editorial</span>
              <textarea className="input min-h-28" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} />
            </label>
            <button type="submit" className="btn-primary inline-flex items-center justify-center gap-2" disabled={saving}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Crear borrador
            </button>
          </form>
        </Panel>

        <Panel className={adminToneClass("search")}>
          <PanelTitle eyebrow="Seleccionar">Franquicias</PanelTitle>
          <input className="input mb-3" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar franquicia…" />
          {loading ? (
            <p className="text-sm text-muted">Cargando…</p>
          ) : (
            <div className="max-h-[620px] space-y-2 overflow-auto pr-1">
              {visibleFranchises.map((franchise) => (
                <button
                  key={franchise.id}
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left transition ${selectedSlug === franchise.slug ? "border-accent bg-accent/10" : "border-border bg-background/45 hover:border-accent/40"}`}
                  onClick={() => setSelectedSlug(franchise.slug)}
                >
                  <span className="block font-semibold text-foreground">{franchise.name}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {franchise.gameCount} {franchise.gameCount === 1 ? "juego" : "juegos"} · {franchise.seriesCount} {franchise.seriesCount === 1 ? "saga" : "sagas"} · {franchise.status === "published" ? "Publicada" : "Borrador"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="space-y-6">
        {error && <AdminNotice tone="danger">{error}</AdminNotice>}
        {message && <AdminNotice tone="status">{message}</AdminNotice>}
        {!detail ? (
          <Panel className={adminToneClass("status")}>
            <p className="text-sm text-muted">Selecciona una franquicia para editarla.</p>
          </Panel>
        ) : (
          <>
            <Panel className={adminToneClass("edit")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <PanelTitle eyebrow="Franquicia">{detail.franchise.name}</PanelTitle>
                  <p className="text-xs text-muted">{detail.franchise.id} · slug bloqueado: {detail.franchise.slug}</p>
                </div>
                {detail.franchise.status === "published" && (
                  <Link href={`/franquicia/${detail.franchise.slug}`} target="_blank" className="btn-secondary inline-flex items-center gap-2">
                    Ver pública <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
              <AdminFunctionCard tone="edit" className="mt-5 space-y-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Nombre</span>
                  <input className="input" value={editName} onChange={(event) => setEditName(event.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Perfil editorial</span>
                  <textarea className="input min-h-36" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Estado</span>
                  <select className="input" value={editStatus} onChange={(event) => setEditStatus(event.target.value as "draft" | "published")}>
                    <option value="draft">Borrador</option>
                    <option value="published">Publicada</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2"
                  disabled={saving}
                  onClick={() => void patchSelected({ action: "update", name: editName, description: editDescription, status: editStatus }, "Franquicia guardada.")}
                >
                  <Save className="h-4 w-4" aria-hidden="true" /> Guardar
                </button>
              </AdminFunctionCard>
            </Panel>

            <Panel className={adminToneClass("edit")}>
              <PanelTitle eyebrow="Pertenencia">Sagas y subseries</PanelTitle>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Saga</span>
                  <select className="input" value={seriesSlug} onChange={(event) => setSeriesSlug(event.target.value)}>
                    <option value="">Seleccionar…</option>
                    {seriesOptions.map((series) => <option key={series.slug} value={series.slug}>{series.name} ({series.gameCount})</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-foreground">
                  <input type="checkbox" checked={seriesPrimary} onChange={(event) => setSeriesPrimary(event.target.checked)} /> Principal
                </label>
                <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!seriesSlug || saving} onClick={() => void patchSelected({ action: "set-series", seriesSlug, primary: seriesPrimary }, "Relación de saga guardada.")}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Asociar
                </button>
              </div>
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {detail.series.map((series) => (
                  <li key={series.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <Link href={`/saga/${series.slug}`} target="_blank" className="font-semibold text-foreground hover:text-accent">{series.name}</Link>
                      <p className="text-xs text-muted">{series.gameCount} {series.gameCount === 1 ? "juego" : "juegos"}{series.primary ? " · Principal" : " · Relacionada"}</p>
                    </div>
                    <div className="flex gap-2">
                      {!series.primary && <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={saving} onClick={() => void patchSelected({ action: "set-series", seriesSlug: series.slug, primary: true }, "Franquicia principal actualizada.")}>Hacer principal</button>}
                      <button type="button" className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-700" disabled={saving} onClick={() => void patchSelected({ action: "remove-series", seriesSlug: series.slug }, "Relación retirada.")}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Retirar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel className={adminToneClass("edit")}>
              <PanelTitle eyebrow="Pertenencia directa">Juegos</PanelTitle>
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_auto_auto] lg:items-end">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Catalog ID</span>
                  <input className="input font-mono text-xs" value={gameId} onChange={(event) => setGameId(event.target.value)} placeholder="ps4-…" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Rol</span>
                  <select className="input" value={gameRole} onChange={(event) => setGameRole(event.target.value as FranchiseRole | "")}>
                    {FRANCHISE_ROLE_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-foreground"><input type="checkbox" checked={gamePrimary} onChange={(event) => setGamePrimary(event.target.checked)} /> Principal</label>
                <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!gameId.trim() || saving} onClick={() => void patchSelected({ action: "add-game", gameId: gameId.trim(), primary: gamePrimary, role: gameRole || null }, "Juego asociado.")}><Plus className="h-4 w-4" aria-hidden="true" /> Asociar</button>
              </div>
              <div className="mt-4 max-h-[420px] overflow-auto border-y border-border">
                {detail.games.map((game) => (
                  <div key={game.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{game.title}</p>
                      <p className="text-xs text-muted">{game.id} · {FRANCHISE_MEMBERSHIP_LABELS[game.membership]}{game.role ? ` · ${FRANCHISE_ROLE_LABELS[game.role]}` : ""}</p>
                    </div>
                    {game.membership !== "inherited" && <button type="button" className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-700" disabled={saving} onClick={() => void patchSelected({ action: "remove-game", gameId: game.id }, "Pertenencia directa retirada.")}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Retirar directa</button>}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className={adminToneClass("edit")}>
              <PanelTitle eyebrow="Semántica">Relaciones entre entidades</PanelTitle>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Origen</span><select className="input" value={sourceType} onChange={(event) => setSourceType(event.target.value as RelationshipEntityType)}>{ENTITY_TYPES.map((type) => <option key={type} value={type}>{FRANCHISE_ENTITY_LABELS[type]}</option>)}</select></label>
                <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">ID origen</span><input className="input font-mono text-xs" value={sourceId} onChange={(event) => setSourceId(event.target.value)} /></label>
                <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Relación</span><select className="input" value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as RelationshipType)}>{RELATIONSHIP_TYPES.map((type) => <option key={type} value={type}>{FRANCHISE_RELATIONSHIP_LABELS[type]}</option>)}</select></label>
                <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Destino</span><select className="input" value={targetType} onChange={(event) => setTargetType(event.target.value as RelationshipEntityType)}>{ENTITY_TYPES.map((type) => <option key={type} value={type}>{FRANCHISE_ENTITY_LABELS[type]}</option>)}</select></label>
                <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">ID destino</span><input className="input font-mono text-xs" value={targetId} onChange={(event) => setTargetId(event.target.value)} /></label>
              </div>
              <button type="button" className="btn-primary mt-3 inline-flex items-center gap-2" disabled={!sourceId.trim() || !targetId.trim() || saving} onClick={() => void patchSelected({ action: "add-relationship", sourceType, sourceId: sourceId.trim(), targetType, targetId: targetId.trim(), relationshipType }, "Relación añadida.")}><Plus className="h-4 w-4" aria-hidden="true" /> Añadir relación</button>
              <ul className="mt-4 divide-y divide-border border-y border-border">
                {detail.relationships.map((relationship) => (
                  <li key={relationship.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="text-sm text-foreground">{relationship.label} <Link href={relationship.href} target="_blank" className="font-semibold text-accent hover:underline">{relationship.entityName}</Link></span>
                    <button type="button" className="btn-secondary h-9 w-9 p-0 text-red-700" title="Retirar relación" disabled={saving} onClick={() => void patchSelected({ action: "remove-relationship", relationshipId: relationship.id }, "Relación retirada.")}><Trash2 className="mx-auto h-4 w-4" aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

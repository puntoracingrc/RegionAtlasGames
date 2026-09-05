"use client";

import Link from "next/link";
import { Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminNotice } from "@/components/admin/admin-visual";
import type { AdminGameFranchiseContext } from "@/lib/admin-franchise-manager";
import {
  FRANCHISE_ENTITY_LABELS,
  FRANCHISE_MEMBERSHIP_LABELS,
  FRANCHISE_RELATIONSHIP_LABELS,
  FRANCHISE_ROLE_OPTIONS,
} from "@/lib/franchise-labels";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "@/lib/franchise-types";
import type { FranchiseRole, RelationshipEntityType, RelationshipType } from "@/lib/franchise-types";

export function AdminGameFranchisePanel({ gameId }: { gameId: string }) {
  const [context, setContext] = useState<AdminGameFranchiseContext | null>(null);
  const [franchiseSlug, setFranchiseSlug] = useState("");
  const [franchisePrimary, setFranchisePrimary] = useState(false);
  const [franchiseRole, setFranchiseRole] = useState<FranchiseRole | "">("");
  const [seriesSlug, setSeriesSlug] = useState("");
  const [targetType, setTargetType] = useState<RelationshipEntityType>("game");
  const [targetId, setTargetId] = useState("");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>("sequel_to");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ mode: "game-context", gameId });
    const response = await fetch(`/api/admin/entities/franchises?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No se pudieron cargar franquicias y sagas.");
    setContext(data.context);
  }, [gameId]);

  useEffect(() => {
    // The loader updates state only after its request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudieron cargar las relaciones."));
  }, [load]);

  async function request(url: string, init: RequestInit, success: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(url, init);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar el cambio.");
      await load();
      setMessage(success);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el cambio.");
    } finally {
      setSaving(false);
    }
  }

  async function patchFranchise(slug: string, body: Record<string, unknown>, success: string) {
    return request(`/api/admin/entities/franchises/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, success);
  }

  if (!context) return <p className="text-sm text-muted">Cargando franquicias y sagas…</p>;
  const selectedFranchises = context.franchises.filter((franchise) => franchise.selected);
  const availableFranchises = context.franchises.filter((franchise) => !franchise.selected);
  const selectedSeries = new Set(context.series.map((series) => series.slug));
  const availableSeries = context.seriesOptions.filter((series) => !selectedSeries.has(series.slug));

  return (
    <div className="space-y-6">
      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
      {message && <AdminNotice tone="status">{message}</AdminNotice>}

      <section>
        <h3 className="font-semibold text-foreground">Franquicias</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem_auto_auto] lg:items-end">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Añadir franquicia</span>
            <select className="input" value={franchiseSlug} onChange={(event) => setFranchiseSlug(event.target.value)}>
              <option value="">Seleccionar…</option>
              {availableFranchises.map((franchise) => <option key={franchise.id} value={franchise.slug}>{franchise.name}{franchise.status === "draft" ? " · Borrador" : ""}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Rol</span>
            <select className="input" value={franchiseRole} onChange={(event) => setFranchiseRole(event.target.value as FranchiseRole | "")}>
              {FRANCHISE_ROLE_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-foreground"><input type="checkbox" checked={franchisePrimary} onChange={(event) => setFranchisePrimary(event.target.checked)} /> Principal</label>
          <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!franchiseSlug || saving} onClick={() => void patchFranchise(franchiseSlug, { action: "add-game", gameId, primary: franchisePrimary, role: franchiseRole || null }, "Franquicia asociada.")}><Plus className="h-4 w-4" aria-hidden="true" /> Asociar</button>
        </div>

        <ul className="mt-4 divide-y divide-border border-y border-border">
          {selectedFranchises.map((franchise) => (
            <li key={franchise.id} className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_11rem_auto_auto] lg:items-center">
              <div>
                <Link href={`/franquicia/${franchise.slug}`} target="_blank" className="font-semibold text-foreground hover:text-accent">{franchise.name}</Link>
                <p className="text-xs text-muted">{franchise.membership ? FRANCHISE_MEMBERSHIP_LABELS[franchise.membership] : "Sin pertenencia"}{franchise.primary ? " · Principal" : ""}</p>
              </div>
              <select
                className="input"
                value={franchise.role ?? ""}
                onChange={(event) => {
                  const role = (event.target.value || null) as FranchiseRole | null;
                  setContext((current) => current ? {
                    ...current,
                    franchises: current.franchises.map((item) => item.id === franchise.id ? { ...item, role } : item),
                  } : current);
                }}
              >
                {FRANCHISE_ROLE_OPTIONS.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground"><input type="checkbox" checked={franchise.primary} onChange={(event) => setContext((current) => current ? { ...current, franchises: current.franchises.map((item) => item.id === franchise.id ? { ...item, primary: event.target.checked } : event.target.checked && item.selected ? { ...item, primary: false } : item) } : current)} /> Principal</label>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary h-9 w-9 p-0" title="Guardar pertenencia" disabled={saving} onClick={() => void patchFranchise(franchise.slug, { action: "update-game", gameId, primary: franchise.primary, role: franchise.role }, "Pertenencia actualizada.")}><Save className="mx-auto h-4 w-4" aria-hidden="true" /></button>
                {franchise.membership !== "inherited" && <button type="button" className="btn-secondary h-9 w-9 p-0 text-red-700" title="Retirar pertenencia directa" disabled={saving} onClick={() => void patchFranchise(franchise.slug, { action: "remove-game", gameId }, "Pertenencia directa retirada.")}><Trash2 className="mx-auto h-4 w-4" aria-hidden="true" /></button>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-border pt-5">
        <h3 className="font-semibold text-foreground">Sagas / Subseries</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <select className="input flex-1" value={seriesSlug} onChange={(event) => setSeriesSlug(event.target.value)}>
            <option value="">Seleccionar…</option>
            {availableSeries.map((series) => <option key={series.slug} value={series.slug}>{series.name} ({series.catalogEntryCount} fichas)</option>)}
          </select>
          <button type="button" className="btn-primary inline-flex items-center justify-center gap-2" disabled={!seriesSlug || saving} onClick={() => void request(`/api/admin/entities/series/${encodeURIComponent(seriesSlug)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add-game", gameId }) }, "Saga asociada.")}><Plus className="h-4 w-4" aria-hidden="true" /> Asociar saga</button>
        </div>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {context.series.map((series) => (
            <li key={series.slug} className="flex items-center justify-between gap-3 py-3">
              <Link href={`/saga/${series.slug}`} target="_blank" className="font-semibold text-foreground hover:text-accent">{series.name}</Link>
              <button type="button" className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-700" disabled={saving} onClick={() => void request(`/api/admin/entities/series/${encodeURIComponent(series.slug)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove-game", gameId }) }, "Saga retirada.")}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Retirar</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-border pt-5">
        <h3 className="font-semibold text-foreground">Relaciones</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select className="input" value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as RelationshipType)}>{RELATIONSHIP_TYPES.map((type) => <option key={type} value={type}>{FRANCHISE_RELATIONSHIP_LABELS[type]}</option>)}</select>
          <select className="input" value={targetType} onChange={(event) => setTargetType(event.target.value as RelationshipEntityType)}>{ENTITY_TYPES.map((type) => <option key={type} value={type}>{FRANCHISE_ENTITY_LABELS[type]}</option>)}</select>
          <input className="input font-mono text-xs" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="ID de destino" />
        </div>
        <button type="button" className="btn-primary mt-3 inline-flex items-center gap-2" disabled={!targetId.trim() || saving} onClick={() => void request("/api/admin/entities/relationships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType: "game", sourceId: gameId, targetType, targetId: targetId.trim(), relationshipType }) }, "Relación añadida.")}><Plus className="h-4 w-4" aria-hidden="true" /> Añadir relación</button>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {context.relationships.map((relationship) => (
            <li key={relationship.id} className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm text-foreground">{relationship.label} <Link href={relationship.href} target="_blank" className="font-semibold text-accent hover:underline">{relationship.entityName}</Link></span>
              <button type="button" className="btn-secondary h-9 w-9 p-0 text-red-700" title="Retirar relación" disabled={saving} onClick={() => void request(`/api/admin/entities/relationships?id=${encodeURIComponent(relationship.id)}`, { method: "DELETE" }, "Relación retirada.")}><Trash2 className="mx-auto h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminNotice } from "@/components/admin/admin-visual";
import type { AdminSeriesFranchiseContext } from "@/lib/admin-franchise-manager";
import { FRANCHISE_ENTITY_LABELS, FRANCHISE_RELATIONSHIP_LABELS } from "@/lib/franchise-labels";
import { ENTITY_TYPES, RELATIONSHIP_TYPES } from "@/lib/franchise-types";
import type { RelationshipEntityType, RelationshipType } from "@/lib/franchise-types";

const CLASSIFICATION_LABELS = {
  franchise: "Franquicia legacy promocionada",
  series: "Saga / Subserie confirmada",
  ambiguous: "Ambigua: conservar sin migración destructiva",
};

export function AdminSeriesFranchisePanel({ seriesSlug }: { seriesSlug: string }) {
  const [context, setContext] = useState<AdminSeriesFranchiseContext | null>(null);
  const [franchiseSlug, setFranchiseSlug] = useState("");
  const [primary, setPrimary] = useState(true);
  const [targetType, setTargetType] = useState<RelationshipEntityType>("series");
  const [targetId, setTargetId] = useState("");
  const [relationshipType, setRelationshipType] = useState<RelationshipType>("derived_from");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ mode: "series-context", seriesSlug });
    const response = await fetch(`/api/admin/entities/franchises?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "No se pudo cargar la clasificación.");
    setContext(data.context);
  }, [seriesSlug]);

  useEffect(() => {
    // The loader updates state only after its request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudo cargar la clasificación."));
  }, [load]);

  async function mutateFranchise(action: "set-series" | "remove-series", slug: string, nextPrimary = false) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/entities/franchises/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, seriesSlug, primary: nextPrimary }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar la relación.");
      await load();
      setMessage(action === "set-series" ? "Pertenencia actualizada." : "Pertenencia retirada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la relación.");
    } finally {
      setSaving(false);
    }
  }

  async function addRelationship() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/entities/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType: "series",
          sourceId: seriesSlug,
          targetType,
          targetId: targetId.trim(),
          relationshipType,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo añadir la relación.");
      setTargetId("");
      await load();
      setMessage("Relación añadida.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo añadir la relación.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRelationship(id: string) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/entities/relationships?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo retirar la relación.");
      await load();
      setMessage("Relación retirada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo retirar la relación.");
    } finally {
      setSaving(false);
    }
  }

  if (!context) {
    return <p className="text-sm text-muted">Cargando pertenencia y relaciones…</p>;
  }

  const selected = context.franchises.filter((franchise) => franchise.selected);
  const available = context.franchises.filter((franchise) => !franchise.selected);

  return (
    <div className="space-y-5">
      {error && <AdminNotice tone="danger">{error}</AdminNotice>}
      {message && <AdminNotice tone="status">{message}</AdminNotice>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="font-semibold text-foreground">Clasificación</h3>
          <p className="mt-1 text-sm text-muted">
            {context.classification
              ? CLASSIFICATION_LABELS[context.classification.classification]
              : "Sin clasificación previa"}
          </p>
        </div>
        {context.classification && (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            Confianza {context.classification.confidence}
          </span>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-foreground">Franquicias</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Añadir pertenencia</span>
            <select className="input" value={franchiseSlug} onChange={(event) => setFranchiseSlug(event.target.value)}>
              <option value="">Seleccionar…</option>
              {available.map((franchise) => <option key={franchise.id} value={franchise.slug}>{franchise.name}{franchise.status === "draft" ? " · Borrador" : ""}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-foreground"><input type="checkbox" checked={primary} onChange={(event) => setPrimary(event.target.checked)} /> Principal</label>
          <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={!franchiseSlug || saving} onClick={() => void mutateFranchise("set-series", franchiseSlug, primary)}><Plus className="h-4 w-4" aria-hidden="true" /> Asociar</button>
        </div>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {selected.map((franchise) => (
            <li key={franchise.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <Link href={`/franquicia/${franchise.slug}`} target="_blank" className="font-semibold text-foreground hover:text-accent">{franchise.name}</Link>
                <p className="text-xs text-muted">{franchise.primary ? "Principal" : "Relacionada"}</p>
              </div>
              <div className="flex gap-2">
                {!franchise.primary && <button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={saving} onClick={() => void mutateFranchise("set-series", franchise.slug, true)}>Hacer principal</button>}
                <button type="button" className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-700" disabled={saving} onClick={() => void mutateFranchise("remove-series", franchise.slug)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Retirar</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">Relaciones semánticas</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Tipo</span><select className="input" value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as RelationshipType)}>{RELATIONSHIP_TYPES.map((type) => <option key={type} value={type}>{FRANCHISE_RELATIONSHIP_LABELS[type]}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Entidad destino</span><select className="input" value={targetType} onChange={(event) => setTargetType(event.target.value as RelationshipEntityType)}>{ENTITY_TYPES.map((type) => <option key={type} value={type}>{FRANCHISE_ENTITY_LABELS[type]}</option>)}</select></label>
          <label className="space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted">ID destino</span><input className="input font-mono text-xs" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="slug, franchise:slug o catalog ID" /></label>
        </div>
        <button type="button" className="btn-primary mt-3 inline-flex items-center gap-2" disabled={!targetId.trim() || saving} onClick={() => void addRelationship()}><Plus className="h-4 w-4" aria-hidden="true" /> Añadir relación</button>
        <ul className="mt-3 divide-y divide-border border-y border-border">
          {context.relationships.map((relationship) => (
            <li key={relationship.id} className="flex items-center justify-between gap-3 py-3">
              <span className="text-sm text-foreground">{relationship.label} <Link href={relationship.href} target="_blank" className="font-semibold text-accent hover:underline">{relationship.entityName}</Link></span>
              <button type="button" className="btn-secondary h-9 w-9 p-0 text-red-700" title="Retirar relación" disabled={saving} onClick={() => void removeRelationship(relationship.id)}><Trash2 className="mx-auto h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

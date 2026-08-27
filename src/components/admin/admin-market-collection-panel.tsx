"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type {
  MarketCollectionMode,
  MarketResearchBatch,
} from "@/lib/market-research-types";

type Option = { value: string; label: string; helper?: string };
type Props = {
  initialBatches: MarketResearchBatch[];
  platformOptions: Option[];
  regionOptions: Option[];
};

const MODE_LABELS: Record<MarketCollectionMode, string> = {
  missing_any: "Falta precio o portada",
  missing_price: "Falta precio",
  missing_cover: "Falta portada",
  refresh: "Actualizar fichas existentes",
};

function statusLabel(status: MarketResearchBatch["status"]): string {
  if (status === "ready") return "Preparado";
  if (status === "running") return "Procesando";
  if (status === "paused") return "Pausado";
  if (status === "completed") return "Terminado";
  return "Cancelado";
}

function statusTone(status: MarketResearchBatch["status"]): "green" | "amber" | "rose" | "neutral" {
  if (status === "completed") return "green";
  if (status === "running" || status === "ready") return "amber";
  if (status === "cancelled") return "rose";
  return "neutral";
}

function formatBatchDate(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function batchProgress(batch: MarketResearchBatch) {
  const completed = batch.targets.filter((target) => target.status === "completed").length;
  const failed = batch.targets.filter((target) => target.status === "failed").length;
  const done = completed + failed;
  return {
    completed,
    failed,
    done,
    total: batch.targets.length,
    percent: batch.targets.length ? Math.round((done / batch.targets.length) * 100) : 0,
  };
}

function diagnosticLog(batch: MarketResearchBatch): string {
  const progress = batchProgress(batch);
  return [
    "REGION_ATLAS_MARKET_COLLECTION_V1",
    "project=regionatlas.games",
    "repo=/Users/macbookpro14/Projects/pal-es-market",
    "admin=/admin/precios",
    "deploy_flow=branch -> commit -> push -> PR -> checks -> merge -> main CI -> verify production",
    "rules=read-only-first; preserve regional variants; never expose tokens; do not mutate real data without explicit admin action",
    `batchId=${batch.id}`,
    `status=${batch.status}`,
    `mode=${batch.mode}`,
    `platform=${batch.platformSlug}`,
    `region=${batch.region ?? "all"}`,
    `progress=${progress.done}/${progress.total}`,
    `failed=${progress.failed}`,
    "targets=",
    ...batch.targets.map((target) => [
      target.catalogId,
      target.region,
      target.status,
      `observations=${target.observations}`,
      `routed=${target.routed}`,
      `covers=${target.covers}`,
      target.error ? `error=${target.error}` : "",
    ].filter(Boolean).join("|")),
    "events=",
    ...batch.log.map((entry) => `${entry.at}|${entry.level}|${entry.catalogId ?? "-"}|${entry.message}`),
  ].join("\n");
}

export function AdminMarketCollectionPanel({ initialBatches, platformOptions, regionOptions }: Props) {
  const [batches, setBatches] = useState(initialBatches);
  const [selectedId, setSelectedId] = useState(initialBatches[0]?.id ?? "");
  const [platformSlug, setPlatformSlug] = useState(platformOptions[0]?.value ?? "");
  const [region, setRegion] = useState("");
  const [mode, setMode] = useState<MarketCollectionMode>("missing_any");
  const [limit, setLimit] = useState(10);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loopRef = useRef(false);

  const selected = batches.find((batch) => batch.id === selectedId) ?? batches[0] ?? null;
  const progress = selected ? batchProgress(selected) : null;

  function updateBatch(batch: MarketResearchBatch) {
    setBatches((current) => [batch, ...current.filter((item) => item.id !== batch.id)].slice(0, 12));
    setSelectedId(batch.id);
  }

  async function processBatch(batchId: string) {
    if (loopRef.current) return;
    loopRef.current = true;
    setWorking(true);
    setError(null);
    try {
      while (loopRef.current) {
        const response = await fetch(`/api/admin/market-research/batches/${encodeURIComponent(batchId)}/next`, {
          method: "POST",
        });
        const payload = await response.json() as { error?: string; batch?: MarketResearchBatch };
        if (!response.ok || !payload.batch) throw new Error(payload.error ?? "No se pudo procesar el lote.");
        updateBatch(payload.batch);
        if (["completed", "paused", "cancelled"].includes(payload.batch.status)) break;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de red durante el lote.");
    } finally {
      loopRef.current = false;
      setWorking(false);
    }
  }

  async function createBatch() {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/market-research/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformSlug, region: region || null, mode, limit }),
      });
      const payload = await response.json() as { error?: string; batch?: MarketResearchBatch };
      if (!response.ok || !payload.batch) throw new Error(payload.error ?? "No se pudo crear el lote.");
      updateBatch(payload.batch);
      setMessage(`Lote creado con ${payload.batch.targets.length} ficha(s).`);
      setWorking(false);
      await processBatch(payload.batch.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de red al crear el lote.");
      setWorking(false);
    }
  }

  async function changeStatus(action: "pause" | "resume" | "cancel") {
    if (!selected) return;
    if (action === "pause") loopRef.current = false;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/market-research/batches/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json() as { error?: string; batch?: MarketResearchBatch };
      if (!response.ok || !payload.batch) throw new Error(payload.error ?? "No se pudo actualizar el lote.");
      updateBatch(payload.batch);
      if (action === "resume") {
        setWorking(false);
        await processBatch(payload.batch.id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de red al actualizar el lote.");
    } finally {
      if (action !== "resume") setWorking(false);
    }
  }

  async function copyLog() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(diagnosticLog(selected));
      setMessage("Log copiado.");
    } catch {
      setError("El navegador no permitió copiar el log.");
    }
  }

  return (
    <Panel className={adminToneClass("search")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PanelTitle eyebrow="eBay Browse">Recopilación regional controlada</PanelTitle>
          <p className="mt-1 text-sm text-muted">Precios actuales y candidatos de portada por variante.</p>
        </div>
        {selected && <Badge tone={statusTone(selected.status)}>{statusLabel(selected.status)}</Badge>}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1.3fr_110px_auto] xl:items-end">
        <label className="text-xs font-semibold text-muted">
          Plataforma
          <select value={platformSlug} onChange={(event) => setPlatformSlug(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
            {platformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Región
          <select value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
            <option value="">Todas</option>
            {regionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Objetivo
          <select value={mode} onChange={(event) => setMode(event.target.value as MarketCollectionMode)} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground">
            {Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Fichas
          <input type="number" min={1} max={25} value={limit} onChange={(event) => setLimit(Math.min(25, Math.max(1, Number(event.target.value) || 1)))} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground" />
        </label>
        <button type="button" onClick={createBatch} disabled={working || !platformSlug} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {working ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
          Crear y comenzar
        </button>
      </div>

      {error && <p className="mt-4 flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm font-semibold text-red-800 dark:text-red-200"><AlertTriangle size={17} aria-hidden="true" />{error}</p>}
      {message && <p className="mt-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{message}</p>}

      {selected && progress && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-foreground">{selected.platformSlug.toUpperCase()} · {MODE_LABELS[selected.mode]}</p>
              <p className="mt-1 text-xs text-muted">{selected.region ?? "Todas las regiones"} · {progress.done}/{progress.total} procesadas · {progress.failed} fallos</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(selected.status === "ready" || selected.status === "paused") && (
                <button type="button" onClick={() => selected.status === "paused" ? changeStatus("resume") : processBatch(selected.id)} disabled={working} className="btn-secondary inline-flex items-center gap-2 text-xs">
                  <RotateCcw size={15} aria-hidden="true" /> Continuar
                </button>
              )}
              {selected.status === "running" && (
                <button type="button" onClick={() => changeStatus("pause")} className="btn-secondary inline-flex items-center gap-2 text-xs">
                  <Pause size={15} aria-hidden="true" /> Pausar
                </button>
              )}
              {!["completed", "cancelled"].includes(selected.status) && (
                <button type="button" onClick={() => changeStatus("cancel")} disabled={working} className="btn-secondary inline-flex items-center gap-2 text-xs">
                  <Square size={14} aria-hidden="true" /> Cancelar
                </button>
              )}
              <button type="button" onClick={copyLog} className="btn-secondary inline-flex items-center gap-2 text-xs">
                <Clipboard size={15} aria-hidden="true" /> Copiar log
              </button>
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted/20" aria-label={`Progreso ${progress.percent}%`}>
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>

          <div className="mt-4 max-h-80 divide-y divide-border overflow-y-auto border-y border-border">
            {selected.targets.map((target) => (
              <div key={target.catalogId} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{target.title}</p>
                  <p className="mt-1 text-xs text-muted">{target.region} · {target.observations} anuncios · {target.routed} redirigidos · {target.covers} portadas</p>
                  {target.error && <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">{target.error}</p>}
                </div>
                <span className="inline-flex min-w-24 items-center justify-end gap-1.5 text-xs font-semibold text-muted">
                  {target.status === "running" && <LoaderCircle size={15} className="animate-spin text-accent" aria-hidden="true" />}
                  {target.status === "completed" && <CheckCircle2 size={15} className="text-emerald-600" aria-hidden="true" />}
                  {target.status === "failed" && <AlertTriangle size={15} className="text-red-600" aria-hidden="true" />}
                  {target.status === "pending" ? "Pendiente" : target.status === "running" ? "Analizando" : target.status === "completed" ? "Completado" : "Falló"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {batches.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          {batches.slice(0, 6).map((batch) => (
            <button key={batch.id} type="button" onClick={() => setSelectedId(batch.id)} className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${batch.id === selected?.id ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted"}`}>
              {batch.platformSlug.toUpperCase()} · {formatBatchDate(batch.createdAt)}
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

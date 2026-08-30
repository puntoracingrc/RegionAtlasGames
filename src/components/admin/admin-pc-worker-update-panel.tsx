"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  GitCommitHorizontal,
  MonitorCog,
  Play,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminToneClass, type AdminVisualTone } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type {
  PcWorkerUpdateAction,
  PcWorkerUpdateOverview,
} from "@/lib/price-worker-update";

type ApiResponse = {
  ok?: boolean;
  overview?: PcWorkerUpdateOverview;
  error?: string;
};

async function loadOverview(): Promise<{ overview: PcWorkerUpdateOverview | null; error: string }> {
  try {
    const response = await fetch("/api/admin/price-worker/update", { cache: "no-store" });
    const data = await response.json().catch(() => null) as ApiResponse | null;
    if (!response.ok || !data?.ok || !data.overview) {
      return { overview: null, error: data?.error ?? "No se pudo leer el estado del PC." };
    }
    return { overview: data.overview, error: "" };
  } catch {
    return { overview: null, error: "No se pudo leer el estado del PC." };
  }
}

function shortSha(value: string | null | undefined): string {
  return value ? value.slice(0, 12) : "sin informar";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sin lectura";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Fecha no válida";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Madrid",
  }).format(parsed);
}

function isFresh(value: string | null | undefined): boolean {
  if (!value) return false;
  const checkedAt = new Date(value).getTime();
  return Number.isFinite(checkedAt) && Date.now() - checkedAt < 10 * 60 * 1000;
}

function updateLabel(value: string): string {
  if (value === "queued") return "En cola";
  if (value === "updated") return "Actualizado";
  if (value === "configured") return "Motores configurados";
  if (value === "already_current") return "Ya estaba actualizado";
  if (value === "error") return "Error";
  return "Sin actualización registrada";
}

function overviewTone(overview: PcWorkerUpdateOverview | null): AdminVisualTone {
  if (!overview) return "neutral";
  if (overview.update.status === "error" || overview.health.git.error || overview.health.git.clean === false) {
    return "danger";
  }
  const aligned = Boolean(
    overview.deploymentSha
      && overview.health.git.commitSha === overview.deploymentSha
      && overview.health.git.branch === "main"
      && overview.health.git.clean === true,
  );
  return aligned && isFresh(overview.health.checkedAt) ? "status" : "edit";
}

function copyLog(overview: PcWorkerUpdateOverview | null): string {
  return [
    "REGION_ATLAS_PC_WORKER_STATUS_V1",
    "CODEX_HANDOFF_CONTEXT_V1",
    "scope=pc_worker_safe_update",
    "project=regionatlas.games",
    "local_repo=/Users/macbookpro14/Projects/pal-es-market",
    "production=https://www.regionatlas.games",
    "github=https://github.com/puntoracingrc/RegionAtlasGames",
    "admin=/admin/precios",
    "rules=read-only-first; never expose tokens; never mutate catalog or real data without explicit approval",
    "deploy_flow=branch -> commit -> push -> PR -> checks -> merge -> main CI -> verify production",
    "worker_update=exact production SHA; official origin; main only; clean checkout; fast-forward only",
    "collector_policy=bounded pages; delay and jitter; stop on 403/429; prices require Git review",
    `copiedAt=${new Date().toISOString()}`,
    `overview=${JSON.stringify(overview)}`,
  ].join("\n");
}

export function AdminPcWorkerUpdatePanel() {
  const [overview, setOverview] = useState<PcWorkerUpdateOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<PcWorkerUpdateAction | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    const result = await loadOverview();
    if (result.overview) setOverview(result.overview);
    setError(result.error);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    void loadOverview().then((result) => {
      if (!active) return;
      if (result.overview) setOverview(result.overview);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (overview?.update.status !== "queued") return;
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(timer);
  }, [overview?.update.status]);

  async function queueUpdate(action: PcWorkerUpdateAction) {
    const confirmation = action === "automatic_sources" || action === "ps4_pilot"
      ? "Se actualizará el worker al commit exacto de producción y se activará el barrido semanal prudente de PS4, PS5 y Switch 2. ¿Continuar?"
      : "Se actualizará el worker al commit exacto de producción. ¿Continuar?";
    if (!window.confirm(confirmation)) return;

    setSubmitting(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/price-worker/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => null) as ApiResponse | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo encolar la actualización.");
        return;
      }
      setMessage(
        action === "automatic_sources" || action === "ps4_pilot"
          ? "Actualización y motores modernos en cola. El panel comprobará la respuesta del PC."
          : "Actualización en cola. El panel comprobará la respuesta del PC.",
      );
      await refresh();
    } catch {
      setError("No se pudo encolar la actualización.");
    } finally {
      setSubmitting(null);
    }
  }

  async function copyDiagnostic() {
    try {
      await navigator.clipboard.writeText(copyLog(overview));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("No se pudo copiar el diagnóstico.");
    }
  }

  const tone = overviewTone(overview);
  const aligned = Boolean(
    overview?.deploymentSha
      && overview.health.git.commitSha === overview.deploymentSha
      && overview.health.git.branch === "main"
      && overview.health.git.clean === true,
  );
  const fresh = isFresh(overview?.health.checkedAt);
  const busy = submitting !== null;
  const controlsDisabled = busy || !overview?.queueAvailable;
  const statusTone = overview?.update.status === "error" ? "rose"
    : overview?.update.status === "queued" ? "amber"
      : overview?.update.ok ? "green" : "neutral";
  const healthLabel = useMemo(() => {
    if (!overview?.health.available) return "PC sin telemetría";
    if (!fresh) return "Lectura antigua";
    if (!overview.health.git.ok || overview.health.git.clean === false) return "Revisión necesaria";
    return aligned ? "PC alineado" : "Actualización pendiente";
  }, [aligned, fresh, overview]);

  return (
    <Panel className={adminToneClass(tone)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MonitorCog aria-hidden="true" className="h-5 w-5 shrink-0" />
            <PanelTitle eyebrow="PC externo">Actualización segura del worker</PanelTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={tone === "danger" ? "rose" : tone === "status" ? "green" : "amber"}>{healthLabel}</Badge>
            <Badge tone={statusTone}>{updateLabel(overview?.update.status ?? "not_reported")}</Badge>
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="btn-secondary inline-flex items-center gap-2 text-sm">
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar estado
        </button>
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-4 border-y border-border/80 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">Última señal</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">{formatDate(overview?.health.checkedAt)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">PC</dt>
          <dd className="mt-1 truncate text-sm font-semibold text-foreground" title={overview?.health.hostname ?? undefined}>
            {overview?.health.hostname ?? overview?.health.runnerId ?? "Sin identificar"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">Commit PC</dt>
          <dd className="mt-1 flex items-center gap-2 font-mono text-xs font-semibold text-foreground">
            <GitCommitHorizontal aria-hidden="true" className="h-4 w-4 shrink-0" />
            {shortSha(overview?.health.git.commitSha)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">Commit producción</dt>
          <dd className="mt-1 font-mono text-xs font-semibold text-foreground">{shortSha(overview?.deploymentSha)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void queueUpdate("update_only")}
          disabled={controlsDisabled}
          className="btn-secondary inline-flex items-center gap-2 text-sm"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {submitting === "update_only" ? "Encolando..." : "Actualizar PC"}
        </button>
        <button
          type="button"
          onClick={() => void queueUpdate("automatic_sources")}
          disabled={controlsDisabled}
          className="btn-primary inline-flex items-center gap-2 text-sm"
        >
          <Play aria-hidden="true" className="h-4 w-4" />
          {submitting === "automatic_sources" ? "Encolando..." : "Actualizar y activar PS4, PS5 y Switch 2"}
        </button>
        <button type="button" onClick={() => void copyDiagnostic()} className="btn-secondary inline-flex items-center gap-2 text-sm">
          <Clipboard aria-hidden="true" className="h-4 w-4" />
          {copied ? "Copiado" : "Copiar diagnóstico"}
        </button>
      </div>

      {!overview?.queueAvailable && overview?.queueBlockReason ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-100/60 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/25 dark:text-amber-100">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {overview.queueBlockReason}
        </p>
      ) : null}
      {overview?.health.available && aligned && fresh ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          El PC está en <code>main</code>, limpio y ejecutando el commit de producción.
        </p>
      ) : null}
      {overview?.health.available && overview.health.git.clean === false ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-rose-300/70 bg-rose-100/60 p-3 text-sm text-rose-900 dark:border-rose-400/30 dark:bg-rose-950/25 dark:text-rose-100">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          El PC tiene cambios locales. La actualización automática se bloqueará sin sobrescribirlos.
        </p>
      ) : null}
      {!overview?.health.available && !loading ? (
        <p className="mt-4 text-sm leading-6 text-muted">
          El worker antiguo todavía no publica telemetría. La primera actualización requiere arrancar una vez el código nuevo en el PC.
        </p>
      ) : null}
      {overview?.health.todoConsolasWeekly.enabled === true ? (
        <p className="mt-3 text-sm text-foreground">
          Barrido semanal activo: <strong>{overview.health.todoConsolasWeekly.platforms || "plataformas configuradas"}</strong> · origen {overview.health.todoConsolasWeekly.source || "desconocido"}.
        </p>
      ) : null}
      {message ? <p className="mt-4 text-sm font-semibold text-emerald-800 dark:text-emerald-200">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-rose-800 dark:text-rose-200">{error}</p> : null}
      {overview?.update.error ? (
        <p className="mt-4 whitespace-pre-wrap rounded-lg border border-rose-300/70 bg-rose-100/60 p-3 font-mono text-xs leading-5 text-rose-900 dark:border-rose-400/30 dark:bg-rose-950/25 dark:text-rose-100">
          {overview.update.error}
        </p>
      ) : null}
    </Panel>
  );
}

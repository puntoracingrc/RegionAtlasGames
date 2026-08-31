"use client";

import {
  AlertTriangle,
  Clipboard,
  PauseCircle,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  AdminStatTile,
  adminToneClass,
  type AdminVisualTone,
} from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type {
  WallapopCampaignAction,
  WallapopCampaignOverview,
} from "@/lib/wallapop-campaign-control";

type ApiResponse = {
  ok?: boolean;
  overview?: WallapopCampaignOverview;
  error?: string;
};

async function loadOverview(): Promise<{ overview: WallapopCampaignOverview | null; error: string }> {
  try {
    const response = await fetch("/api/admin/price-worker/wallapop", { cache: "no-store" });
    const data = await response.json().catch(() => null) as ApiResponse | null;
    if (!response.ok || !data?.ok || !data.overview) {
      return { overview: null, error: data?.error ?? "No se pudo leer el robot Wallapop." };
    }
    return { overview: data.overview, error: "" };
  } catch {
    return { overview: null, error: "No se pudo leer el robot Wallapop." };
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(date);
}

function statusPresentation(status: string, enabled: boolean): {
  label: string;
  tone: "green" | "amber" | "rose" | "neutral";
  panelTone: AdminVisualTone;
} {
  if (status === "blocked") return { label: "Bloqueado", tone: "rose", panelTone: "danger" };
  if (status === "backoff") return { label: "Pausa por error", tone: "rose", panelTone: "danger" };
  if (status === "batch_running" || status === "batch_queued" || status === "queueing") {
    return { label: "Tanda en curso", tone: "amber", panelTone: "edit" };
  }
  if (status === "stopping") return { label: "Apagando", tone: "amber", panelTone: "edit" };
  if (status === "waiting") return { label: "Esperando", tone: "green", panelTone: "status" };
  if (status === "complete") return { label: "Ciclo completo", tone: "green", panelTone: "status" };
  if (!enabled || status === "disabled") return { label: "Apagado", tone: "neutral", panelTone: "neutral" };
  return { label: "Encendido", tone: "green", panelTone: "status" };
}

function progressPercent(overview: WallapopCampaignOverview | null): number {
  const progress = overview?.campaign.progress;
  if (!progress?.totalGames) return 0;
  return Math.min(100, Math.round((progress.processedGames / progress.totalGames) * 100));
}

function searchOutcomeLabel(outcome: string): string {
  if (outcome === "no_results") return "Sin anuncios";
  if (outcome === "all_discarded") return "Todo descartado";
  if (outcome === "mostly_discarded") return "Descarte alto";
  if (outcome === "error") return "Error";
  return "Con evidencias";
}

function priceDecisionLabel(decision: string | null): string {
  if (decision === "price_changed") return "Precio modificado";
  if (decision === "verified_price_unchanged") return "Precio verificado sin cambios";
  if (decision === "awaiting_more_verified_listings") return "Faltan muestras verificadas";
  if (decision === "rejected_by_price_sync") return "Rechazado por el cálculo";
  if (decision === "no_accepted_listings") return "Sin anuncios aceptados";
  return "Sin diagnóstico de precio";
}

function rejectionReasonLabel(reason: string): string {
  if (reason === "wrong_platform") return "otra plataforma";
  if (reason === "edition_or_extras") return "otra edición o extras";
  if (reason === "numbered_variant") return "otro volumen";
  if (reason === "title_mismatch") return "otro juego";
  if (reason === "ai_or_evidence") return "evidencia insuficiente";
  if (reason === "not_game") return "no es un juego";
  if (reason === "insufficient_evidence") return "anuncio incompleto";
  return reason;
}

function diagnosticText(overview: WallapopCampaignOverview | null): string {
  return [
    "REGION_ATLAS_WALLAPOP_CAMPAIGN_V1",
    "CODEX_HANDOFF_CONTEXT_V1",
    "scope=wallapop_pal_campaign",
    "project=regionatlas.games",
    "local_repo=/Users/macbookpro14/Projects/pal-es-market",
    "production=https://www.regionatlas.games",
    "admin=/admin/precios",
    "rules=read-only-first; never expose tokens; never bypass 403/429/captcha; never exceed 20 games per batch",
    "platform_order=ps4 -> ps5 -> ps3 -> ps2 -> ps1",
    "target_region=PAL España; route incidental verified regions to their exact catalog variant",
    "publish_rule=only verified scoped prices; review ambiguous listings; branch -> PR -> checks -> production",
    `copiedAt=${new Date().toISOString()}`,
    `overview=${JSON.stringify(overview)}`,
  ].join("\n");
}

export function AdminWallapopCampaignPanel() {
  const [overview, setOverview] = useState<WallapopCampaignOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<WallapopCampaignAction | null>(null);
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
    const shouldPoll = overview?.control.status === "queued"
      || overview?.campaign.enabled
      || overview?.campaign.status === "stopping";
    if (!shouldPoll) return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [overview?.campaign.enabled, overview?.campaign.status, overview?.control.status]);

  async function sendControl(action: WallapopCampaignAction) {
    const confirmation = action === "disable"
      ? "Se impedirán nuevas tandas. Si hay una en curso, terminará antes de apagarse. ¿Continuar?"
      : action === "restart"
        ? "Se borrará el cursor del ciclo y volverá a empezar por PS4. Úsalo solo tras revisar el bloqueo o completar una vuelta. ¿Continuar?"
        : "Se encenderá el robot Wallapop PAL. Ejecutará hasta 20 juegos por tanda y parará ante bloqueos. Confirma que cuentas con autorización para automatizar esta fuente. ¿Continuar?";
    if (!window.confirm(confirmation)) return;

    setSubmitting(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/price-worker/wallapop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => null) as ApiResponse | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error ?? "No se pudo cambiar el estado del robot.");
        return;
      }
      setMessage(action === "disable"
        ? "Parada solicitada. El PC terminará la tanda actual y no iniciará otra."
        : "Orden enviada al PC. El panel comprobará la confirmación.");
      await refresh();
    } catch {
      setError("No se pudo cambiar el estado del robot.");
    } finally {
      setSubmitting(null);
    }
  }

  async function copyDiagnostic() {
    try {
      await navigator.clipboard.writeText(diagnosticText(overview));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("No se pudo copiar el diagnóstico.");
    }
  }

  const campaign = overview?.campaign;
  const stopping = campaign?.status === "stopping";
  const presentation = statusPresentation(campaign?.status ?? "disabled", campaign?.enabled ?? false);
  const progress = progressPercent(overview);
  const busy = submitting !== null || overview?.control.status === "queued";
  const currentBatch = campaign?.activeBatch;
  const currentPlatform = currentBatch?.platformSlug
    ?? campaign?.settings.platforms.find((slug) => {
      const row = campaign.progress.byPlatform[slug];
      return row && row.processed < row.total;
    })
    ?? "—";
  const canToggle = campaign?.enabled ? overview?.canDisable : overview?.canEnable;
  const lastBatch = campaign?.lastBatch;
  const lastStats = lastBatch?.collectorStats;
  const issueDiagnostics = lastBatch?.searchDiagnostics.filter((diagnostic) => (
    diagnostic.outcome !== "accepted"
    || diagnostic.priceDecision === "awaiting_more_verified_listings"
    || diagnostic.priceDecision === "rejected_by_price_sync"
  )) ?? [];
  const platformProgress = useMemo(
    () => campaign?.settings.platforms.map((slug) => ({ slug, ...(campaign.progress.byPlatform[slug] ?? { processed: 0, total: 0 }) })) ?? [],
    [campaign],
  );

  return (
    <Panel className={adminToneClass(presentation.panelTone)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
            <PanelTitle eyebrow="Wallapop · PC worker">Robot PAL por catálogo</PanelTitle>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={presentation.tone}>{presentation.label}</Badge>
            <Badge tone="neutral">Máximo 20 por tanda</Badge>
            <Badge tone="neutral">Pausa mínima 10 min</Badge>
            <Badge tone="green">Verificados: publicación automática</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={campaign?.enabled ?? false}
            onClick={() => void sendControl(campaign?.enabled ? "disable" : "enable")}
            disabled={busy || stopping || !canToggle}
            className={campaign?.enabled ? "btn-secondary inline-flex items-center gap-2 text-sm" : "btn-primary inline-flex items-center gap-2 text-sm"}
          >
            {campaign?.enabled ? <PauseCircle aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
            {submitting
              ? "Enviando..."
              : stopping
                ? "Finalizando tanda..."
                : campaign?.enabled
                  ? "Detener tras tanda"
                  : "Encender"}
          </button>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="btn-secondary inline-flex items-center gap-2 text-sm" title="Actualizar estado">
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <button type="button" onClick={() => void copyDiagnostic()} className="btn-secondary inline-flex items-center gap-2 text-sm">
            <Clipboard aria-hidden="true" className="h-4 w-4" />
            {copied ? "Copiado" : "Copiar diagnóstico"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminStatTile tone={presentation.panelTone} label="Catálogo recorrido" value={`${campaign?.progress.processedGames ?? 0}/${campaign?.progress.totalGames || "—"}`} helper={`${progress}% del ciclo`} />
        <AdminStatTile tone={presentation.panelTone} label="Plataforma" value={currentPlatform.toUpperCase()} helper={`${campaign?.progress.completedPlatforms ?? 0}/${campaign?.progress.totalPlatforms ?? 5} terminadas`} />
        <AdminStatTile tone={presentation.panelTone} label="Tanda actual" value={currentBatch?.catalogIds.length ?? 0} helper={currentBatch?.jobId ?? "ninguna en marcha"} />
        <AdminStatTile tone={presentation.panelTone} label="Precios modificados" value={campaign?.priceResults.changedGames ?? 0} helper={`${campaign?.priceResults.batchesWithChanges ?? 0} tanda(s) con cambios`} />
        <AdminStatTile tone={presentation.panelTone} label="Próxima tanda" value={formatDate(campaign?.nextRunAt)} helper={campaign?.campaignId ? `ciclo ${campaign.campaignId}` : "aún no iniciado"} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-border" aria-label={`Campaña Wallapop al ${progress}%`}>
        <div
          className={`h-full rounded-full ${presentation.panelTone === "danger" ? "bg-rose-500" : presentation.panelTone === "edit" ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {platformProgress.map((row) => (
          <Badge key={row.slug} tone={row.total > 0 && row.processed >= row.total ? "green" : row.processed > 0 ? "amber" : "neutral"}>
            {row.slug.toUpperCase()} {row.processed}/{row.total || "—"}
          </Badge>
        ))}
      </div>

      {lastBatch ? (
        <section className="mt-5 border-y border-border py-4" aria-labelledby="wallapop-last-batch-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="wallapop-last-batch-title" className="text-sm font-bold text-foreground">Resultado de la última tanda</h3>
            <p className="text-xs text-muted">{lastBatch.platformSlug?.toUpperCase() ?? "—"} · {formatDate(lastBatch.finishedAt)}</p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
            <div>
              <dt className="text-xs font-semibold uppercase text-muted">Juegos consultados</dt>
              <dd className="mt-1 text-xl font-black text-foreground">{lastStats?.gamesRequested ?? lastBatch.catalogIds.length}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted">Con anuncios útiles</dt>
              <dd className="mt-1 text-xl font-black text-foreground">{lastStats?.gamesWithListings ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted">Anuncios aceptados</dt>
              <dd className="mt-1 text-xl font-black text-foreground">{lastStats?.listings ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted">Región verificada</dt>
              <dd className="mt-1 text-xl font-black text-foreground">{lastStats?.listingsVerified ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-muted">Precios modificados</dt>
              <dd className="mt-1 text-xl font-black text-foreground">{lastBatch.verifiedCatalogIds.length}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {lastBatch?.searchDiagnostics.length ? (
        <section className="mt-5" aria-labelledby="wallapop-query-diagnostics-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="wallapop-query-diagnostics-title" className="text-sm font-bold text-foreground">Búsquedas que necesitan atención</h3>
            <p className="text-xs text-muted">{issueDiagnostics.length} de {lastBatch.searchDiagnostics.length} juegos</p>
          </div>
          {issueDiagnostics.length ? (
            <div className="mt-3 overflow-x-auto border-y border-border">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="bg-card/60 text-xs uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Juego</th>
                    <th className="px-3 py-2 font-semibold">Resultado</th>
                    <th className="px-3 py-2 font-semibold">Precio</th>
                    <th className="px-3 py-2 font-semibold">Consultas exactas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {issueDiagnostics.map((diagnostic, diagnosticIndex) => (
                    <tr key={diagnostic.catalogId ?? diagnostic.title ?? `diagnostic-${diagnosticIndex}`} className="align-top">
                      <td className="px-3 py-3">
                        <p className="max-w-64 font-bold text-foreground">{diagnostic.title ?? diagnostic.catalogId ?? "Juego sin título"}</p>
                        <p className="mt-1 text-xs text-muted">{diagnostic.catalogId}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={diagnostic.outcome === "error" ? "rose" : diagnostic.outcome === "accepted" ? "amber" : "neutral"}>
                          {searchOutcomeLabel(diagnostic.outcome)}
                        </Badge>
                        <p className="mt-2 whitespace-nowrap text-xs text-muted">
                          {diagnostic.acceptedListings}/{diagnostic.candidateCount} aceptados · {diagnostic.verifiedListings} verificados
                        </p>
                        {Object.keys(diagnostic.rejectionReasons).length ? (
                          <p className="mt-1 max-w-72 text-xs text-muted">
                            Descartes: {Object.entries(diagnostic.rejectionReasons)
                              .map(([reason, count]) => `${rejectionReasonLabel(reason)} ${count}`)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-foreground">
                        {priceDecisionLabel(diagnostic.priceDecision)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-2xl flex-wrap gap-2">
                          {diagnostic.attempts.map((attempt, index) => (
                            <span key={`${attempt.query}-${index}`} className="rounded border border-border bg-background/70 px-2 py-1 text-xs text-foreground">
                              “{attempt.query}” · {attempt.results} resultado(s)
                              {attempt.mode === "active" ? " · activos" : attempt.mode === "recent" ? " · últimos 30 días" : ""}
                              {attempt.relevantResults ? ` · ${attempt.relevantResults} del juego` : ""}
                            </span>
                          ))}
                          {!diagnostic.attempts.length ? <span className="text-xs text-muted">Sin consultas registradas</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200">La tanda no dejó búsquedas problemáticas.</p>
          )}
        </section>
      ) : lastBatch ? (
        <p className="mt-5 text-sm text-muted">El PC aún no ha enviado el detalle por juego. Aparecerá tras la primera tanda ejecutada con la versión nueva.</p>
      ) : null}

      {!overview?.canEnable && !campaign?.enabled && overview?.controlBlockReason ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-100/60 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/25 dark:text-amber-100">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {overview.controlBlockReason}
        </p>
      ) : null}
      {campaign?.error ? (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-rose-300/70 bg-rose-100/60 p-3 text-sm text-rose-900 dark:border-rose-400/30 dark:bg-rose-950/25 dark:text-rose-100">
          <span className="flex min-w-0 items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{campaign.error}</span>
          </span>
          <button type="button" onClick={() => void sendControl("restart")} disabled={busy || !overview?.canEnable} className="btn-secondary inline-flex items-center gap-2 text-xs">
            <RotateCcw aria-hidden="true" className="h-4 w-4" />
            Reiniciar ciclo
          </button>
        </div>
      ) : null}
      {campaign?.status === "complete" ? (
        <button type="button" onClick={() => void sendControl("restart")} disabled={busy || !overview?.canEnable} className="btn-secondary mt-4 inline-flex items-center gap-2 text-sm">
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Empezar nuevo ciclo
        </button>
      ) : null}
      {currentBatch?.titles.length ? (
        <p className="mt-4 truncate text-xs text-muted" title={currentBatch.titles.join(" · ")}>
          Juegos de la tanda: {currentBatch.titles.join(" · ")}
        </p>
      ) : null}
      {message ? <p className="mt-4 text-sm font-semibold text-emerald-800 dark:text-emerald-200">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-rose-800 dark:text-rose-200">{error}</p> : null}
    </Panel>
  );
}

import Link from "next/link";
import { AdminPriceCoverageTable } from "@/components/admin/admin-price-coverage-table";
import { AdminPriceSourceSettingsPanel } from "@/components/admin/admin-price-source-settings-panel";
import { AdminStatTile, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { getAdminPriceDashboard, type AdminPriceSyncRow } from "@/lib/admin-price-dashboard";
import {
  adminPriceCollectUnavailableReason,
  isAdminPriceCollectAvailable,
  type AdminPriceJobMeta,
} from "@/lib/admin-price-collect";
import type { AdminPriceCronAttempt } from "@/lib/admin-price-cron-log";
import { readPriceSourceSettings } from "@/lib/price-source-settings";

export const dynamic = "force-dynamic";

type RecentLabel = "hoy" | "ayer" | "reciente" | "antiguo";
type CoverageSort = "updated-desc" | "updated-asc" | "coverage-desc" | "coverage-asc";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function formatNextRun(value: string | null | undefined): string {
  if (!value) return "Sin hora programada";
  const date = new Date(value);
  const madridDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const today = madridDay(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = madridDay(tomorrowDate);
  const day = madridDay(date);
  const prefix = day === today ? "Hoy" : day === tomorrow ? "Mañana" : formatDate(value);
  const time = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(date);
  return `${prefix} a las ${time}`;
}

function dayLabel(value: string | null | undefined): RecentLabel {
  if (!value) return "antiguo";
  const date = new Date(value);
  const now = new Date();
  const madridDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const today = madridDay(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = madridDay(yesterdayDate);
  const day = madridDay(date);
  if (day === today) return "hoy";
  if (day === yesterday) return "ayer";
  const ageMs = now.getTime() - date.getTime();
  return ageMs < 1000 * 60 * 60 * 24 * 7 ? "reciente" : "antiguo";
}

function toneForLabel(label: RecentLabel): "green" | "amber" | "neutral" {
  if (label === "hoy") return "green";
  if (label === "ayer" || label === "reciente") return "amber";
  return "neutral";
}

function statusTone(status: AdminPriceJobMeta["status"]): "green" | "amber" | "rose" {
  if (status === "done") return "green";
  if (status === "running") return "amber";
  return "rose";
}

function cronStatusTone(status: "started" | "done" | "blocked" | "skipped" | "error"): "green" | "amber" | "rose" | "neutral" {
  if (status === "started" || status === "done") return "green";
  if (status === "skipped") return "amber";
  if (status === "blocked" || status === "error") return "rose";
  return "neutral";
}

function cronStatusLabel(status: "started" | "done" | "blocked" | "skipped" | "error"): string {
  if (status === "started") return "lanzado";
  if (status === "done") return "terminado";
  if (status === "skipped") return "saltado";
  if (status === "blocked") return "bloqueado";
  return "error";
}

function isHostingRotationAttempt(attempt: AdminPriceCronAttempt): boolean {
  return attempt.userAgent === "1and1-hosting-cron" || attempt.id.startsWith("hosting-");
}

function isTodayOrYesterday(value: string | null | undefined): boolean {
  const label = dayLabel(value);
  return label === "hoy" || label === "ayer";
}

function jobTitle(job: AdminPriceJobMeta): string {
  if (job.targets?.length) return `Lote de ${job.targets.length} objetivo(s)`;
  if (job.platformSlug) return `Plataforma ${job.platformSlug}${job.region ? ` · ${job.region}` : ""}`;
  return `Juego ${job.catalogId ?? "—"}`;
}

function jobProgress(job: AdminPriceJobMeta): { done: number; total: number; failed: number; pct: number } | null {
  if (!job.targets?.length) return null;
  const total = job.targets.length;
  const failed = job.failedTargets?.length ?? 0;
  const done = (job.completedTargets?.length ?? 0) + failed;
  return {
    done,
    total,
    failed,
    pct: Math.min(100, Math.round((done / total) * 100)),
  };
}

function updatedBySource(row: AdminPriceSyncRow): { label: string; value: number }[] {
  return [
    ["P2P total", row.gamesUpdated],
    ["Wallapop", row.wallapopGamesUpdated],
    ["eBay", row.ebayGamesUpdated],
    ["Vinted", row.vintedGamesUpdated],
    ["CeX", row.cexGamesUpdated],
    ["JGO", row.jgoGamesUpdated],
    ["Chollo", row.cholloGamesUpdated],
    ["Kaoto", row.kaotoGamesUpdated],
    ["TodoConsolas", row.tcnsGamesUpdated],
    ["TodoColeccion", row.tcGamesUpdated],
  ]
    .map(([label, value]) => ({ label: String(label), value: Number(value ?? 0) }))
    .filter((item) => item.value > 0);
}

function splitSourceLabel(source: string | null | undefined): string[] {
  if (!source) return [];
  return source
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sourceKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function realSourceLabels(row: AdminPriceSyncRow): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const clean = label.trim();
    if (!clean || clean === "P2P total") return;
    const key = sourceKey(clean);
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(clean);
  };

  splitSourceLabel(row.source).forEach(add);
  updatedBySource(row).forEach((source) => add(source.label));
  return labels;
}

function normalizeCoverageSort(value: string | string[] | undefined): CoverageSort {
  const current = Array.isArray(value) ? value[0] : value;
  if (current === "updated-asc" || current === "coverage-desc" || current === "coverage-asc") return current;
  return "updated-desc";
}

export default async function AdminPricesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const coverageSort = normalizeCoverageSort(params?.coverageSort);
  const [dashboard, priceSourceSettings] = await Promise.all([
    getAdminPriceDashboard(20),
    readPriceSourceSettings(),
  ]);
  const canCollectPrices = isAdminPriceCollectAvailable();
  const freshRows = dashboard.recentSyncs.filter((row) => {
    return isTodayOrYesterday(row.lastSyncAt);
  });
  const rotationAttempts = dashboard.cronAttempts.filter(isHostingRotationAttempt);
  const lastRotationDone = rotationAttempts.find((attempt) => attempt.status === "done");
  const recentRotationAttempts = rotationAttempts.filter((attempt) => isTodayOrYesterday(attempt.at));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className={`${adminToneClass("status")} lg:col-span-2`}>
          <PanelTitle eyebrow="Rotación automática">Estado de recopilación</PanelTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminStatTile tone="status" label="Última rotación OK" value={formatDate(lastRotationDone?.at)} />
            <AdminStatTile tone="status" label="Intentos hoy / ayer" value={recentRotationAttempts.length} helper="solo cron real del hosting" />
            <AdminStatTile tone="status" label="Siguiente paso" value={dashboard.nextStep.label} helper={formatNextRun(dashboard.nextStep.scheduledAt)} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Este bloque solo cuenta llamadas reales de la rotación automática del hosting externo. Los lanzamientos manuales se ven abajo.
          </p>
          <div className="mt-3 rounded-2xl border border-border bg-background/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">eBay API / afiliación</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{dashboard.ebayStatus.label}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={dashboard.ebayStatus.collectionReady ? "green" : "rose"}>API directa</Badge>
                <Badge tone={dashboard.ebayStatus.affiliateReady ? "green" : "amber"}>afiliación</Badge>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{dashboard.ebayStatus.helper}</p>
            {dashboard.ebayStatus.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                {dashboard.ebayStatus.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
          {dashboard.nextStep.platforms.length > 1 && (
            <p className="mt-3 text-xs text-muted">
              Este lote incluye: {dashboard.nextStep.platforms.map((p) => p.name).join(", ")}.
            </p>
          )}
        </Panel>

        <Panel className={adminToneClass("search")}>
          <PanelTitle eyebrow="Lectura rápida">Sincronizaciones recientes</PanelTitle>
          {freshRows.length > 0 ? (
            <div className="space-y-2 text-sm">
              {freshRows.map((row) => (
                <div key={row.platformSlug} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/45 p-3">
                  <span className="font-semibold text-foreground">{row.platformName}</span>
                  <Badge tone={toneForLabel(dayLabel(row.lastSyncAt))}>{dayLabel(row.lastSyncAt)}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-background/45 p-3 text-sm leading-6 text-muted">
              No hay recopilaciones registradas hoy ni ayer. La última registrada queda abajo en el historial.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Fuente de datos: {dashboard.syncStateSource === "worker" ? "worker externo" : "copia local"}.
          </p>
        </Panel>
      </div>

      <AdminPriceSourceSettingsPanel initialSettings={priceSourceSettings} />

      <Panel className={adminToneClass("search")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle eyebrow="Historial">Últimas plataformas sincronizadas</PanelTitle>
          <div className="flex flex-wrap gap-2">
            {dashboard.workerUrls.state ? (
              <a href={dashboard.workerUrls.state} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                Ver estado JSON
              </a>
            ) : null}
            <Link href="/admin/entidades" className="btn-secondary text-xs">
              Lanzar por plataforma
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th className="py-3 pr-4 font-semibold">Plataforma</th>
                <th className="py-3 pr-4 font-semibold">Cuándo</th>
                <th className="py-3 pr-4 font-semibold">Fuente</th>
                <th className="py-3 pr-4 font-semibold">P2P verif.</th>
                <th className="py-3 pr-4 font-semibold">Cobertura sync</th>
                <th className="py-3 pr-4 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentSyncs.map((row) => {
                const sourceUpdates = updatedBySource(row);
                const realUpdates = sourceUpdates.filter((source) => source.label !== "P2P total");
                const sources = realSourceLabels(row);
                const label = dayLabel(row.lastSyncAt);
                return (
                  <tr key={row.platformSlug} className="border-b border-border/60 align-top last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-foreground">{row.platformName}</div>
                      <div className="text-xs text-muted">{row.platformSlug}</div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Badge tone={toneForLabel(label)}>{label}</Badge>
                      <p className="mt-1 text-xs text-muted">{formatDate(row.lastSyncAt)}</p>
                    </td>
                    <td className="py-3 pr-4 max-w-[320px]">
                      {realUpdates.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {realUpdates.map((source) => (
                            <Badge key={source.label} tone="neutral">
                              {source.label}: {source.value}
                            </Badge>
                          ))}
                        </div>
                      ) : sources.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {sources.map((source) => (
                            <Badge key={source} tone="neutral">
                              {source}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap font-semibold text-foreground">
                      {row.gamesUpdated ?? 0}/{row.gamesTargeted ?? 0}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted">
                      {row.coveragePct == null ? "—" : `${row.coveragePct}%`}
                    </td>
                    <td className="py-3 pr-4 text-xs text-muted">
                      {sourceUpdates.length > 0
                        ? sourceUpdates.map((s) => `${s.label}: ${s.value}`).join(" · ")
                        : "Sin fuentes con actualización"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted">
          Cobertura sync = porcentaje de juegos objetivo que recibieron precio P2P verificado en esa sincronización concreta.
          El detalle separa el P2P total de las fuentes reales que aportaron datos.
        </p>
      </Panel>

      <Panel className={adminToneClass("bulk")}>
        <div className="mb-4">
          <PanelTitle eyebrow="Cobertura">Estado de precios por plataforma y región</PanelTitle>
          <p className="mt-2 text-sm leading-6 text-muted">
            Marca plataformas completas o regiones concretas, revisa el tiempo estimado y lanza la
            selección en un solo job. El desglose por región te indica dónde falta cobertura.
          </p>
        </div>
        <AdminPriceCoverageTable
          rows={dashboard.platformHealth}
          initialSort={coverageSort}
          canCollect={canCollectPrices}
          unavailableReason={canCollectPrices ? undefined : adminPriceCollectUnavailableReason()}
          manualJobs={dashboard.manualJobs}
        />
      </Panel>

      <Panel className={adminToneClass("status")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle eyebrow="Cron automático">Últimos intentos reales de la rueda</PanelTitle>
          <div className="flex flex-wrap gap-2">
            {dashboard.workerUrls.attempts ? (
              <a href={dashboard.workerUrls.attempts} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                Ver intentos JSON
              </a>
            ) : null}
            {dashboard.workerUrls.cronLog ? (
              <a href={dashboard.workerUrls.cronLog} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                Abrir log crudo
              </a>
            ) : null}
          </div>
        </div>
        {rotationAttempts.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {rotationAttempts.map((attempt) => (
              <div key={attempt.id} className="rounded-2xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">
                      {attempt.label || attempt.step || "Rotación de precios"}
                    </p>
                    <p className="mt-1 text-xs text-muted">{formatDate(attempt.at)}</p>
                  </div>
                  <Badge tone={cronStatusTone(attempt.status)}>{cronStatusLabel(attempt.status)}</Badge>
                </div>
                {attempt.message ? <p className="mt-3 text-xs leading-5 text-muted">{attempt.message}</p> : null}
                {attempt.jobId ? (
                  <Link href={`/api/admin/price-jobs/${encodeURIComponent(attempt.jobId)}`} className="mt-3 inline-flex text-xs font-semibold text-accent">
                    Ver job lanzado →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-background/45 p-3 text-sm text-muted">
            Todavía no hay intentos reales del hosting registrados. Cuando el cron llame a la rueda, aquí quedará reflejado aunque falle.
          </p>
        )}
        <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-slate-950 p-4 shadow-inner">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">
                Terminal del cron
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Últimas líneas del log real publicado por el hosting externo.
              </p>
            </div>
            {dashboard.workerUrls.cronLog ? (
              <a href={dashboard.workerUrls.cronLog} target="_blank" rel="noreferrer" className="rounded-xl border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10">
                Ver archivo completo
              </a>
            ) : null}
          </div>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-400/20 bg-black/70 p-4 font-mono text-xs leading-6 text-emerald-100">
            {dashboard.cronLogTail || "Sin log del cron disponible todavía."}
          </pre>
        </div>
      </Panel>

      <Panel className={adminToneClass("status")}>
        <PanelTitle eyebrow="Trabajos manuales">Lanzados desde el admin</PanelTitle>
        {dashboard.manualJobs.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {dashboard.manualJobs.map((job) => (
              <div key={job.jobId} className="rounded-2xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{jobTitle(job)}</p>
                    <p className="mt-1 text-xs text-muted">Inicio: {formatDate(job.startedAt)}</p>
                    {job.finishedAt && <p className="text-xs text-muted">Fin: {formatDate(job.finishedAt)}</p>}
                    {job.estimateMinutes ? <p className="text-xs text-muted">Estimado: ≈ {job.estimateMinutes} min</p> : null}
                  </div>
                  <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                </div>
                {(() => {
                  const progress = jobProgress(job);
                  if (!progress) return null;
                  return (
                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-3 text-xs text-muted">
                        <span>
                          {progress.done}/{progress.total} procesados
                          {progress.failed ? ` · ${progress.failed} con error` : ""}
                        </span>
                        <span>{progress.pct}%</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${progress.pct}%` }} />
                      </div>
                    </div>
                  );
                })()}
                {job.targets?.length ? (
                  <p className="mt-3 text-xs text-muted">
                    Objetivos:{" "}
                    {job.targets
                      .slice(0, 5)
                      .map((target) => `${target.platformSlug}${target.region ? ` · ${target.region}` : ""}`)
                      .join(", ")}
                    {job.targets.length > 5 ? ` y ${job.targets.length - 5} más` : ""}
                  </p>
                ) : null}
                {job.sources?.length ? (
                  <p className="mt-3 text-xs text-muted">Fuentes: {job.sources.join(", ")}</p>
                ) : null}
                {job.error && <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{job.error}</p>}
                <Link href={`/api/admin/price-jobs/${encodeURIComponent(job.jobId)}`} className="mt-3 inline-flex text-xs font-semibold text-accent">
                  Ver JSON del job →
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-border bg-background/45 p-3 text-sm text-muted">
            Todavía no hay trabajos manuales guardados en esta instalación.
          </p>
        )}
      </Panel>
    </div>
  );
}

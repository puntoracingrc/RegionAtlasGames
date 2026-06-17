"use client";

import { useMemo, useRef, useState } from "react";
import type { AdminPlatformPriceHealth } from "@/lib/admin-price-dashboard";
import { Badge } from "@/components/ui";
import { AdminPricePlatformActions } from "./admin-price-platform-actions";

type CoverageSort = "updated-desc" | "updated-asc" | "coverage-desc" | "coverage-asc";

const SORT_OPTIONS: { value: CoverageSort; label: string }[] = [
  { value: "updated-desc", label: "Más reciente" },
  { value: "updated-asc", label: "Menos reciente" },
  { value: "coverage-desc", label: "Más cobertura" },
  { value: "coverage-asc", label: "Menos cobertura" },
];

type SelectedTarget = {
  platformSlug: string;
  platformName: string;
  region?: string;
  games: number;
};

type JobTarget = {
  platformSlug: string;
  region?: string;
  exitCode?: number;
  error?: string;
};

type JobState = {
  jobId: string;
  status: "running" | "done" | "error";
  targets?: JobTarget[];
  completedTargets?: JobTarget[];
  failedTargets?: JobTarget[];
  estimateMinutes?: number;
  startedAt?: string;
  finishedAt?: string;
  logTail?: string;
  error?: string;
  appliedSummary?: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function ageLabel(value: string | null | undefined): string {
  if (!value) return "Nunca";
  const ageMs = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

function coverageTone(value: number): "green" | "amber" | "rose" {
  if (value >= 70) return "green";
  if (value >= 25) return "amber";
  return "rose";
}

function syncTime(row: AdminPlatformPriceHealth): number {
  if (!row.lastSyncAt) return 0;
  const value = Date.parse(row.lastSyncAt);
  return Number.isFinite(value) ? value : 0;
}

function sortRows(rows: AdminPlatformPriceHealth[], sort: CoverageSort): AdminPlatformPriceHealth[] {
  return [...rows].sort((a, b) => {
    if (sort === "updated-desc") return syncTime(b) - syncTime(a) || a.platformName.localeCompare(b.platformName, "es");
    if (sort === "updated-asc") return syncTime(a) - syncTime(b) || a.platformName.localeCompare(b.platformName, "es");
    if (sort === "coverage-desc") return b.coveragePct - a.coveragePct || a.platformName.localeCompare(b.platformName, "es");
    return a.coveragePct - b.coveragePct || a.platformName.localeCompare(b.platformName, "es");
  });
}

function targetKey(platformSlug: string, region?: string): string {
  return `${platformSlug}::${region ?? ""}`;
}

function estimateMinutes(targets: SelectedTarget[]): number {
  if (targets.length === 0) return 0;
  const minutes = targets.reduce((total, target) => {
    const cappedGames = Math.min(target.games, target.region ? 90 : 230);
    return total + 4 + cappedGames * 0.35;
  }, Math.max(0, targets.length - 1));
  return Math.max(5, Math.ceil(minutes));
}

function estimateLabel(minutes: number): string {
  if (minutes <= 0) return "Sin selección";
  if (minutes < 60) return `≈ ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `≈ ${hours} h ${rest} min` : `≈ ${hours} h`;
}

function jobProgress(job: JobState | null): { done: number; total: number; failed: number; pct: number } | null {
  if (!job?.targets?.length) return null;
  const total = job.targets.length;
  const done = (job.completedTargets?.length ?? 0) + (job.failedTargets?.length ?? 0);
  return {
    done,
    total,
    failed: job.failedTargets?.length ?? 0,
    pct: Math.min(100, Math.round((done / total) * 100)),
  };
}

export function AdminPriceCoverageTable({
  rows,
  initialSort,
  canCollect,
  unavailableReason,
}: {
  rows: AdminPlatformPriceHealth[];
  initialSort: CoverageSort;
  canCollect: boolean;
  unavailableReason?: string;
}) {
  const [sort, setSort] = useState<CoverageSort>(initialSort);
  const [selected, setSelected] = useState<Record<string, SelectedTarget>>({});
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);
  const selectedTargets = useMemo(() => Object.values(selected), [selected]);
  const estimated = estimateMinutes(selectedTargets);

  function toggle(target: SelectedTarget) {
    const key = targetKey(target.platformSlug, target.region);
    setSelected((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = target;
      return next;
    });
  }

  async function poll(jobId: string) {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
    const read = async () => {
      const res = await fetch(`/api/admin/price-jobs/${encodeURIComponent(jobId)}`).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      const next = data.job as JobState;
      setJob(next);
      if (next.status === "done") {
        setMessage("Lote terminado. Recarga la página para ver la cobertura actualizada.");
        if (pollRef.current != null) window.clearInterval(pollRef.current);
      }
      if (next.status === "error") {
        setError(next.error ?? "El lote terminó con errores. Revisa el job.");
        if (pollRef.current != null) window.clearInterval(pollRef.current);
      }
    };
    await read();
    pollRef.current = window.setInterval(() => void read(), 4000);
  }

  async function startBatch() {
    if (!canCollect) {
      setError(unavailableReason ?? "La recolección manual no está disponible en este entorno.");
      return;
    }
    if (selectedTargets.length === 0) return;
    const preview = selectedTargets
      .map((target) => `${target.platformName}${target.region ? ` · ${target.region}` : ""}`)
      .slice(0, 8)
      .join("\n");
    if (!confirm(`¿Lanzar recolección para ${selectedTargets.length} objetivo(s)?\n\n${preview}\n\nTiempo estimado: ${estimateLabel(estimated)}`)) return;
    setError(null);
    setMessage(null);
    setJob({ jobId: "", status: "running", targets: selectedTargets, estimateMinutes: estimated });
    const res = await fetch("/api/admin/price-jobs/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        estimateMinutes: estimated,
        targets: selectedTargets.map((target) => ({
          platformSlug: target.platformSlug,
          region: target.region,
        })),
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(data?.error ?? "No se pudo lanzar el lote.");
      setMessage(null);
      setJob(null);
      return;
    }
    setJob({ jobId: data.jobId, status: "running", targets: selectedTargets, estimateMinutes: estimated });
    setMessage("Lote en marcha…");
    void poll(data.jobId);
  }

  async function applyJobResults() {
    if (!job?.jobId || job.status !== "done") return;
    if (!confirm("¿Aplicar los precios recogidos al catálogo público?")) return;
    setError(null);
    setMessage("Aplicando resultados…");
    const res = await fetch(`/api/admin/price-jobs/${encodeURIComponent(job.jobId)}/apply`, {
      method: "POST",
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(data?.error ?? "No se pudieron aplicar los resultados.");
      setMessage(null);
      return;
    }
    const summary = `${data.updated} actualizados · ${data.skipped} sin cambios · ${data.errors?.length ?? 0} errores`;
    setJob((current) => (current ? { ...current, appliedSummary: summary } : current));
    setMessage(`Resultados aplicados: ${summary}.`);
  }

  const running = job?.status === "running";
  const progress = jobProgress(job);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/45 p-3">
        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === sort ? "btn-primary text-xs" : "btn-secondary text-xs"}
              onClick={() => setSort(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-muted">
            {selectedTargets.length} seleccionados · {estimateLabel(estimated)}
          </span>
          <button type="button" className="btn-primary text-xs" disabled={!canCollect || running || selectedTargets.length === 0} onClick={() => void startBatch()}>
            {running ? "Recolectando…" : "Lanzar selección"}
          </button>
          {selectedTargets.length > 0 && (
            <button type="button" className="btn-secondary text-xs" disabled={running} onClick={() => setSelected({})}>
              Limpiar
            </button>
          )}
        </div>
      </div>
      {!canCollect && (
        <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          {unavailableReason ?? "La recolección manual no está disponible en este entorno."}
        </p>
      )}
      {message && <p className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">{message}</p>}
      {error && <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">{error}</p>}
      {job && (
        <div className="mb-3 rounded-2xl border border-border bg-background/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {job.status === "running" ? "Recolección en curso" : job.status === "done" ? "Recolección terminada" : "Recolección con errores"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {progress
                  ? `${progress.done}/${progress.total} objetivos procesados${progress.failed ? ` · ${progress.failed} con error` : ""}`
                  : `Tiempo estimado: ${estimateLabel(job.estimateMinutes ?? estimated)}`}
              </p>
            </div>
            {job.jobId && <Badge tone={job.status === "done" ? "green" : job.status === "error" ? "rose" : "amber"}>{job.status}</Badge>}
          </div>
          {progress && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress.pct}%` }} />
            </div>
          )}
          {job.failedTargets?.length ? (
            <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">
              Fallos: {job.failedTargets.map((target) => `${target.platformSlug}${target.region ? ` · ${target.region}` : ""}`).join(", ")}
            </p>
          ) : null}
          {job.status === "done" && job.jobId ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-primary text-xs" onClick={() => void applyJobResults()}>
                Aplicar resultados
              </button>
              {job.appliedSummary && <span className="text-xs text-muted">{job.appliedSummary}</span>}
            </div>
          ) : null}
        </div>
      )}
      {job?.jobId && (
        <a href={`/api/admin/price-jobs/${encodeURIComponent(job.jobId)}`} className="mb-3 inline-flex text-xs font-semibold text-accent">
          Ver job del lote →
        </a>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-muted">
            <tr className="border-b border-border">
              <th className="py-3 pr-4 font-semibold">Sel.</th>
              <th className="py-3 pr-4 font-semibold">Plataforma</th>
              <th className="py-3 pr-4 font-semibold">Cobertura total</th>
              <th className="py-3 pr-4 font-semibold">Verificada</th>
              <th className="py-3 pr-4 font-semibold">Última sync</th>
              <th className="py-3 pr-4 font-semibold">Regiones</th>
              <th className="py-3 pr-4 font-semibold">Acción</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const platformSelected = Boolean(selected[targetKey(row.platformSlug)]);
              return (
                <tr key={row.platformSlug} className="border-b border-border/60 align-top last:border-0">
                  <td className="py-3 pr-4">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-current"
                      checked={platformSelected}
                      onChange={() =>
                        toggle({
                          platformSlug: row.platformSlug,
                          platformName: row.platformName,
                          games: row.totalGames,
                        })
                      }
                      aria-label={`Seleccionar ${row.platformName}`}
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{row.platformName}</span>
                      {row.nextInRotation && <Badge tone="violet">siguiente</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {row.platformSlug} · {row.totalGames.toLocaleString("es-ES")} juegos
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={coverageTone(row.coveragePct)}>{row.coveragePct}%</Badge>
                    <p className="mt-1 text-xs text-muted">
                      {row.pricedGames.toLocaleString("es-ES")} con precio
                    </p>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={coverageTone(row.verifiedCoveragePct)}>{row.verifiedCoveragePct}%</Badge>
                    <p className="mt-1 text-xs text-muted">
                      {row.verifiedGames.toLocaleString("es-ES")} verificados
                    </p>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    <p className="font-medium text-foreground">{ageLabel(row.lastSyncAt)}</p>
                    <p className="mt-1 text-xs text-muted">{formatDate(row.lastSyncAt)}</p>
                    {row.source && <p className="mt-1 max-w-[180px] text-xs text-muted">{row.source}</p>}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="grid min-w-[340px] gap-2">
                      {row.regions.slice(0, 5).map((region) => {
                        const key = targetKey(row.platformSlug, region.region);
                        return (
                          <label key={region.region} className="grid grid-cols-[18px_minmax(90px,1fr)_80px_80px] items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-2 py-1.5 text-xs">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-border accent-current"
                              checked={Boolean(selected[key])}
                              onChange={() =>
                                toggle({
                                  platformSlug: row.platformSlug,
                                  platformName: row.platformName,
                                  region: region.region,
                                  games: region.totalGames,
                                })
                              }
                              aria-label={`Seleccionar ${row.platformName} ${region.region}`}
                            />
                            <span className="truncate font-medium text-foreground">{region.region}</span>
                            <span className="text-muted">{region.coveragePct}% total</span>
                            <span className="text-muted">{region.verifiedCoveragePct}% verif.</span>
                            {region.lastSyncAt && (
                              <span className="col-start-2 col-span-3 text-[10px] text-muted">
                                Región actualizada: {ageLabel(region.lastSyncAt)}
                              </span>
                            )}
                          </label>
                        );
                      })}
                      {row.regions.length > 5 && (
                        <p className="text-[11px] text-muted">+{row.regions.length - 5} regiones más</p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <AdminPricePlatformActions
                      platformSlug={row.platformSlug}
                      platformName={row.platformName}
                      estimateLabel={estimateLabel(estimateMinutes([{ platformSlug: row.platformSlug, platformName: row.platformName, games: row.totalGames }]))}
                      canCollect={canCollect}
                      unavailableReason={unavailableReason}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

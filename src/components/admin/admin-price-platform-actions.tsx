"use client";

import { useRef, useState } from "react";

type JobState = {
  jobId: string;
  status: "running" | "done" | "error";
  logTail?: string;
  error?: string;
};

export function AdminPricePlatformActions({
  platformSlug,
  platformName,
  estimateLabel,
  canCollect,
  unavailableReason,
  onJobUpdate,
  onStopJob,
}: {
  platformSlug: string;
  platformName: string;
  estimateLabel?: string;
  canCollect: boolean;
  unavailableReason?: string;
  onJobUpdate?: (job: JobState) => void;
  onStopJob?: (jobId: string) => void;
}) {
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  async function readJob(jobId: string) {
      try {
        const res = await fetch(`/api/admin/price-jobs/${encodeURIComponent(jobId)}`);
        const data = await res.json();
        if (!res.ok) return;
        const next = data.job as JobState;
        setJob(next);
        onJobUpdate?.(next);
        if (next.status === "done") {
          setMessage("Recolección terminada. Recarga la página para ver la cobertura actualizada.");
          if (pollRef.current != null) window.clearInterval(pollRef.current);
        } else if (next.status === "error") {
          setError(next.error ?? "La recolección falló. Revisa el job.");
          if (pollRef.current != null) window.clearInterval(pollRef.current);
        }
      } catch {
        /* ignore transient polling errors */
      }
  }

  async function poll(jobId: string) {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
    await readJob(jobId);
    pollRef.current = window.setInterval(() => void readJob(jobId), 4000);
  }

  async function start() {
    if (!canCollect) {
      setError(unavailableReason ?? "La recolección manual no está disponible en este entorno.");
      return;
    }
    const estimateText = estimateLabel ? `\nTiempo estimado: ${estimateLabel}` : "";
    if (!confirm(`¿Lanzar recolección de precios para ${platformName}? Puede tardar bastante.${estimateText}`)) return;
    setError(null);
    setMessage(null);
    const pendingJob = { jobId: "", status: "running" } satisfies JobState;
    setJob(pendingJob);
    onJobUpdate?.(pendingJob);
    try {
      const res = await fetch(
        `/api/admin/entities/platforms/${encodeURIComponent(platformSlug)}/collect-prices`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar la recolección.");
        setJob(null);
        return;
      }
      const startedJob = { jobId: data.jobId, status: "running" } satisfies JobState;
      setJob(startedJob);
      onJobUpdate?.(startedJob);
      setMessage("Recolección en curso…");
      void poll(data.jobId);
    } catch {
      setError("Error de red al iniciar recolección.");
      setJob(null);
    }
  }

  const running = job?.status === "running";

  return (
    <div className="space-y-2">
      <button type="button" className="btn-secondary whitespace-nowrap text-xs" disabled={!canCollect || running} onClick={() => void start()}>
        {running ? "Recolectando…" : "Actualizar plataforma"}
      </button>
      {job?.jobId && (
        <div className="flex flex-wrap gap-2">
          <a href={`/api/admin/price-jobs/${encodeURIComponent(job.jobId)}`} className="text-[11px] font-semibold text-accent">
            Ver job →
          </a>
          {running ? (
            <button
              type="button"
              className="text-[11px] font-semibold text-rose-600 dark:text-rose-300"
              onClick={() => onStopJob?.(job.jobId)}
            >
              Parar
            </button>
          ) : null}
        </div>
      )}
      {message && <p className="max-w-[220px] text-[11px] text-emerald-600 dark:text-emerald-400">{message}</p>}
      {error && <p className="max-w-[220px] text-[11px] text-rose-600 dark:text-rose-300">{error}</p>}
    </div>
  );
}

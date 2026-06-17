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
}: {
  platformSlug: string;
  platformName: string;
  estimateLabel?: string;
  canCollect: boolean;
  unavailableReason?: string;
}) {
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  async function poll(jobId: string) {
    if (pollRef.current != null) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/price-jobs/${encodeURIComponent(jobId)}`);
        const data = await res.json();
        if (!res.ok) return;
        const next = data.job as JobState;
        setJob(next);
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
    }, 4000);
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
    setJob({ jobId: "", status: "running" });
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
      setJob({ jobId: data.jobId, status: "running" });
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
        <a href={`/api/admin/price-jobs/${encodeURIComponent(job.jobId)}`} className="block text-[11px] font-semibold text-accent">
          Ver job →
        </a>
      )}
      {message && <p className="max-w-[220px] text-[11px] text-emerald-600 dark:text-emerald-400">{message}</p>}
      {error && <p className="max-w-[220px] text-[11px] text-rose-600 dark:text-rose-300">{error}</p>}
    </div>
  );
}

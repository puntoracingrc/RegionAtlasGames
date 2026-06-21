"use client";

import { useState } from "react";
import type { LocalGameRunnerJob, LocalGameRunnerOfferType } from "@/lib/local-game-runner-jobs";

type Props = {
  initialJobs: LocalGameRunnerJob[];
  tokenConfigured: boolean;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function statusLabel(status: LocalGameRunnerJob["status"]): string {
  if (status === "pending") return "Esperando Mac";
  if (status === "running") return "Ejecutando en Mac";
  if (status === "done") return "Completado";
  if (status === "error") return "Error";
  return "Cancelado";
}

export function AdminLocalGameRunnerPanel({ initialJobs, tokenConfigured }: Props) {
  const [jobs, setJobs] = useState(initialJobs);
  const [platformSlug, setPlatformSlug] = useState<"ps4" | "ps5">("ps4");
  const [offerType, setOfferType] = useState<LocalGameRunnerOfferType>("preowned");
  const [limit, setLimit] = useState(20);
  const [state, setState] = useState<"idle" | "saving" | "error" | "saved">("idle");
  const [message, setMessage] = useState("");

  async function refreshJobs() {
    const response = await fetch("/api/admin/price-local-game-jobs", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { ok?: boolean; jobs?: LocalGameRunnerJob[]; error?: string } | null;
    if (data?.ok && data.jobs) setJobs(data.jobs);
  }

  async function createJob() {
    setState("saving");
    setMessage("");
    const response = await fetch("/api/admin/price-local-game-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformSlug, offerType, limit, maxPages: 1 }),
    });
    const data = await response.json().catch(() => null) as { ok?: boolean; job?: LocalGameRunnerJob; error?: string } | null;
    if (!response.ok || !data?.ok || !data.job) {
      setState("error");
      setMessage(data?.error ?? "No se pudo crear el job local GAME.");
      return;
    }
    setJobs((current) => [data.job!, ...current].slice(0, 30));
    setState("saved");
    setMessage("Job GAME creado. Si tu Mac tiene el runner encendido, lo recogerá solo.");
  }

  return (
    <section className="rounded-3xl border border-blue-300/70 bg-blue-50/70 p-5 shadow-sm dark:border-blue-400/30 dark:bg-blue-950/25 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-700 dark:text-blue-300">GAME local</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-foreground">Runner GAME desde tu Mac</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">
            Crea trabajos GAME para que tu Mac, desde conexión española, los ejecute y suba resultados al worker. No abre puertos en tu Mac.
          </p>
          {!tokenConfigured ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-200">
              Falta configurar <code>LOCAL_GAME_RUNNER_TOKEN</code> en producción. El admin puede crear cola, pero el runner no podrá autenticarse.
            </p>
          ) : null}
        </div>
        <button type="button" onClick={refreshJobs} className="btn-secondary text-sm">Actualizar estado</button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="text-xs font-semibold text-muted">
          Plataforma
          <select value={platformSlug} onChange={(event) => setPlatformSlug(event.target.value as "ps4" | "ps5")} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="ps4">PS4</option>
            <option value="ps5">PS5</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Tipo
          <select value={offerType} onChange={(event) => setOfferType(event.target.value as LocalGameRunnerOfferType)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="preowned">Seminuevo GAME</option>
            <option value="new">Nuevo GAME</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Límite prudente
          <input type="number" min={1} max={60} value={limit} onChange={(event) => setLimit(Number(event.target.value) || 20)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <button type="button" onClick={createJob} disabled={state === "saving"} className="btn-primary self-end">
          {state === "saving" ? "Creando..." : "Lanzar GAME desde Mac"}
        </button>
      </div>

      {message ? (
        <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${state === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {jobs.length ? jobs.map((job) => (
          <article key={job.id} className="rounded-2xl border border-border bg-background/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-foreground">{job.platformSlug.toUpperCase()} · {job.offerType === "preowned" ? "Seminuevo" : "Nuevo"}</p>
                <p className="mt-1 text-xs text-muted">Creado: {formatDate(job.createdAt)} · Actualizado: {formatDate(job.updatedAt)}</p>
                {job.runnerId ? <p className="text-xs text-muted">Runner: {job.runnerId}</p> : null}
              </div>
              <span className="rounded-full border border-border bg-card/70 px-3 py-1 text-[11px] font-bold text-muted">{statusLabel(job.status)}</span>
            </div>
            {job.resultSummary ? (
              <p className="mt-3 text-xs text-muted">
                Filas: {job.resultSummary.rows ?? 0} · detectados: {job.resultSummary.productsDetected ?? "—"} · revisión: {job.resultSummary.review ?? 0}
              </p>
            ) : null}
            {job.error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{job.error}</p> : null}
            {job.resultPath ? <p className="mt-2 break-all text-xs text-muted">Resultado worker: {job.resultPath}</p> : null}
            {job.logTail ? (
              <details className="mt-3 rounded-xl border border-blue-400/25 bg-slate-950 p-3">
                <summary className="cursor-pointer list-none text-xs font-semibold text-blue-200">Log del Mac</summary>
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-blue-400/15 bg-black/70 p-3 font-mono text-[11px] leading-5 text-blue-100">{job.logTail}</pre>
              </details>
            ) : null}
          </article>
        )) : (
          <p className="rounded-xl border border-border bg-background/45 p-3 text-sm text-muted md:col-span-2">
            No hay trabajos GAME locales todavía.
          </p>
        )}
      </div>
    </section>
  );
}

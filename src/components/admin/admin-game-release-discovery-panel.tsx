"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, FilePlus2, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  GameReleaseDiscoveryCandidate,
  GameReleaseDiscoveryResult,
} from "@/lib/game-release-discovery";
import type {
  CatalogDiscoveryReview,
  LocalGameRunnerJob,
} from "@/lib/local-game-runner-jobs";

type Props = {
  initialJobs: LocalGameRunnerJob[];
  tokenConfigured: boolean;
};

type CandidateFeedback = {
  tone: "success" | "warning" | "error";
  message: string;
  redirect?: string;
  matches?: Array<{
    catalogId: string;
    title: string;
    region: string;
    catalogUrl: string;
    matchReason: string;
  }>;
};

function platformLabel(platformSlug: string): string {
  return platformSlug === "switch2" ? "Switch 2" : "PS5";
}

function jobStatusLabel(status: LocalGameRunnerJob["status"]): string {
  if (status === "pending") return "Esperando runner";
  if (status === "running") return "Recopilando";
  if (status === "done") return "Lista para revisar";
  if (status === "error") return "Error";
  return "Cancelada";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function stopReasonLabel(value: string): string {
  if (value === "known_streak") return "3 juegos conocidos seguidos";
  if (value === "candidate_limit") return "límite de candidatos";
  if (value === "last_page") return "última página";
  if (value === "no_products") return "sin más productos";
  return "límite de seguridad";
}

export function AdminGameReleaseDiscoveryPanel({ initialJobs, tokenConfigured }: Props) {
  const [jobs, setJobs] = useState(
    initialJobs.filter((job) => job.jobType === "catalog_discovery"),
  );
  const [platformSlug, setPlatformSlug] = useState<"ps5" | "switch2">("ps5");
  const [state, setState] = useState<"idle" | "saving" | "loading" | "error" | "saved">("idle");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<{ jobId: string; result: GameReleaseDiscoveryResult } | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, CandidateFeedback>>({});
  const hasActiveJobs = useMemo(
    () => jobs.some((job) => job.status === "pending" || job.status === "running"),
    [jobs],
  );

  async function refreshJobs() {
    const response = await fetch("/api/admin/price-local-game-jobs", { cache: "no-store" });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      jobs?: LocalGameRunnerJob[];
      error?: string;
    } | null;
    if (data?.ok && data.jobs) {
      setJobs(data.jobs.filter((job) => job.jobType === "catalog_discovery"));
    }
  }

  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => void refreshJobs(), 10_000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs]);

  async function createDiscoveryJob() {
    setState("saving");
    setMessage("");
    const response = await fetch("/api/admin/price-local-game-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobType: "catalog_discovery",
        platformSlug,
        offerType: "new",
        limit: 80,
        maxPages: 4,
        skipRecentDays: 365,
        repeatStopCount: 3,
      }),
    });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      job?: LocalGameRunnerJob;
      error?: string;
    } | null;
    if (!response.ok || !data?.ok || !data.job) {
      setState("error");
      setMessage(data?.error ?? "No se pudo crear la búsqueda GAME.");
      return;
    }
    setJobs((current) => [data.job!, ...current].slice(0, 30));
    setState("saved");
    setMessage(`Búsqueda ${platformLabel(platformSlug)} encolada.`);
  }

  async function loadResult(jobId: string) {
    setState("loading");
    setMessage("");
    const response = await fetch(`/api/admin/price-local-game-jobs/${encodeURIComponent(jobId)}/result`, {
      cache: "no-store",
    });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      job?: LocalGameRunnerJob;
      result?: GameReleaseDiscoveryResult;
      error?: string;
    } | null;
    if (!response.ok || !data?.ok || !data.job || !data.result) {
      setState("error");
      setMessage(data?.error ?? "No se pudo leer el resultado GAME.");
      return;
    }
    setJobs((current) => current.map((job) => job.id === jobId ? data.job! : job));
    setSelected({ jobId, result: data.result });
    setState("idle");
  }

  function updateReview(jobId: string, sourceSku: string, review: CatalogDiscoveryReview) {
    setJobs((current) => current.map((job) => job.id === jobId
      ? {
          ...job,
          catalogDiscoveryReviews: {
            ...(job.catalogDiscoveryReviews ?? {}),
            [sourceSku]: review,
          },
        }
      : job));
  }

  async function createDraft(candidate: GameReleaseDiscoveryCandidate, confirmDistinct = false) {
    if (!selected) return;
    setBusySku(candidate.sourceSku);
    setFeedback((current) => {
      const next = { ...current };
      delete next[candidate.sourceSku];
      return next;
    });
    const response = await fetch("/api/admin/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: candidate.title,
        platformSlug: candidate.platformSlug,
        region: candidate.region,
        coverUrl: candidate.imageUrl,
        releaseDate: candidate.releaseDate,
        year: candidate.year,
        publisherName: candidate.publisher,
        autoEnrich: false,
        autoAi: false,
        confirmDistinct,
        discoveryJobId: selected.jobId,
        discoverySourceSku: candidate.sourceSku,
      }),
    });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      error?: string;
      message?: string;
      redirect?: string;
      pcId?: number;
      draft?: { catalogId?: string };
      discoveryTrackingWarning?: string | null;
      matches?: CandidateFeedback["matches"];
    } | null;
    setBusySku(null);
    if (response.status === 409 && data?.error === "similar_games") {
      setFeedback((current) => ({
        ...current,
        [candidate.sourceSku]: {
          tone: "warning",
          message: data.message ?? "Hay fichas parecidas que debes revisar.",
          matches: data.matches ?? [],
        },
      }));
      return;
    }
    if (!response.ok || !data?.ok || !data.redirect) {
      setFeedback((current) => ({
        ...current,
        [candidate.sourceSku]: {
          tone: "error",
          message: data?.error ?? "No se pudo crear el borrador.",
        },
      }));
      return;
    }

    const review: CatalogDiscoveryReview = {
      status: "draft_created",
      reviewedAt: new Date().toISOString(),
      pcId: data.pcId ?? null,
      catalogId: data.draft?.catalogId ?? null,
    };
    updateReview(selected.jobId, candidate.sourceSku, review);
    setFeedback((current) => ({
      ...current,
      [candidate.sourceSku]: {
        tone: data.discoveryTrackingWarning ? "warning" : "success",
        message: data.discoveryTrackingWarning
          ? `Borrador creado; no se pudo marcar el candidato: ${data.discoveryTrackingWarning}`
          : "Borrador creado en la cola de catálogo.",
        redirect: data.redirect,
      },
    }));
  }

  async function dismissCandidate(candidate: GameReleaseDiscoveryCandidate) {
    if (!selected) return;
    setBusySku(candidate.sourceSku);
    const response = await fetch(`/api/admin/price-local-game-jobs/${encodeURIComponent(selected.jobId)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceSku: candidate.sourceSku, status: "dismissed" }),
    });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      review?: CatalogDiscoveryReview;
      error?: string;
    } | null;
    setBusySku(null);
    if (!response.ok || !data?.ok || !data.review) {
      setFeedback((current) => ({
        ...current,
        [candidate.sourceSku]: { tone: "error", message: data?.error ?? "No se pudo descartar." },
      }));
      return;
    }
    updateReview(selected.jobId, candidate.sourceSku, data.review);
    setFeedback((current) => ({
      ...current,
      [candidate.sourceSku]: { tone: "success", message: "Candidato descartado." },
    }));
  }

  const selectedJob = selected ? jobs.find((job) => job.id === selected.jobId) : null;
  const pendingCandidates = selected
    ? selected.result.candidates.filter((candidate) => !selectedJob?.catalogDiscoveryReviews?.[candidate.sourceSku])
    : [];

  return (
    <section className="border-y border-emerald-300/60 bg-emerald-50/55 px-4 py-5 dark:border-emerald-400/25 dark:bg-emerald-950/15 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">Catálogo · GAME España</p>
          <h2 className="mt-1 text-2xl font-black text-foreground">Nuevos lanzamientos PS5 y Switch 2</h2>
          <p className="mt-2 text-sm text-muted">Solo disponibles, con fecha ya cumplida y portada. Sin precios ni publicación automática.</p>
        </div>
        <button type="button" onClick={() => void refreshJobs()} className="btn-secondary inline-flex items-center gap-2 text-sm">
          <RefreshCw size={16} aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {!tokenConfigured ? (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-200">
          Falta <code>LOCAL_GAME_RUNNER_TOKEN</code>; las búsquedas quedarán en espera.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-48 text-xs font-semibold text-muted">
          Plataforma
          <select
            value={platformSlug}
            onChange={(event) => setPlatformSlug(event.target.value as "ps5" | "switch2")}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="ps5">PlayStation 5</option>
            <option value="switch2">Nintendo Switch 2</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void createDiscoveryJob()}
          disabled={state === "saving"}
          className="btn-primary inline-flex items-center gap-2"
        >
          <Search size={16} aria-hidden="true" />
          {state === "saving" ? "Encolando..." : "Buscar lanzamientos"}
        </button>
        <span className="pb-2 text-xs text-muted">Automático: semanal · parada tras 3 conocidos</span>
      </div>

      {message ? (
        <p className={`mt-4 rounded-lg border px-4 py-3 text-sm ${state === "error" ? "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/20 dark:text-rose-200" : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200"}`}>
          {message}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {jobs.length ? jobs.slice(0, 8).map((job) => (
          <article key={job.id} className="rounded-lg border border-border bg-background/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-foreground">{platformLabel(job.platformSlug)}</p>
                <p className="mt-1 text-xs text-muted">{formatDate(job.createdAt)} · {jobStatusLabel(job.status)}</p>
              </div>
              {job.status === "done" && job.resultPath ? (
                <button type="button" onClick={() => void loadResult(job.id)} className="btn-secondary inline-flex items-center gap-2 text-xs">
                  <Search size={14} aria-hidden="true" />
                  Revisar
                </button>
              ) : null}
            </div>
            {job.resultSummary ? (
              <p className="mt-3 text-xs text-muted">
                {job.resultSummary.candidates ?? 0} candidatos · {job.resultSummary.existing ?? 0} ya catalogados · {job.resultSummary.seenBefore ?? 0} vistos
              </p>
            ) : null}
            {job.error ? <p className="mt-3 text-xs text-rose-700 dark:text-rose-300">{job.error}</p> : null}
          </article>
        )) : (
          <p className="rounded-lg border border-border bg-background/60 p-4 text-sm text-muted lg:col-span-2">Sin búsquedas todavía.</p>
        )}
      </div>

      {selected ? (
        <div className="mt-6 border-t border-emerald-300/60 pt-5 dark:border-emerald-400/25">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-foreground">{platformLabel(selected.result.platformSlug)} · {pendingCandidates.length} pendientes</h3>
              <p className="mt-1 text-xs text-muted">
                {selected.result.stats.rawProducts} productos revisados · parada: {stopReasonLabel(selected.result.stats.stopReason)}
              </p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="btn-secondary inline-flex items-center gap-2 text-xs">
              <X size={14} aria-hidden="true" />
              Cerrar
            </button>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {selected.result.candidates.map((candidate) => {
              const review = selectedJob?.catalogDiscoveryReviews?.[candidate.sourceSku];
              const note = feedback[candidate.sourceSku];
              return (
                <article key={candidate.sourceSku} className={`grid min-h-44 grid-cols-[88px_1fr] gap-4 rounded-lg border bg-background/80 p-3 ${review ? "border-border opacity-65" : candidate.catalogStatus === "possible_duplicate" ? "border-amber-400/60" : "border-emerald-300/70"}`}>
                  <div className="relative aspect-[3/4] w-[88px] overflow-hidden rounded border border-border bg-white">
                    {candidate.imageUrl ? (
                      <Image src={candidate.imageUrl} alt="" fill sizes="88px" className="object-contain" unoptimized />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-foreground">{candidate.title}</p>
                        <p className="mt-1 text-xs text-muted">
                          Lanzamiento {candidate.releaseDate} · SKU {candidate.sourceSku}
                          {candidate.pegi ? ` · PEGI ${candidate.pegi}` : ""}
                        </p>
                      </div>
                      <span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${candidate.catalogStatus === "possible_duplicate" ? "border-amber-300 text-amber-800 dark:text-amber-200" : "border-emerald-300 text-emerald-800 dark:text-emerald-200"}`}>
                        {candidate.catalogStatus === "possible_duplicate" ? "Parecido" : "Nuevo"}
                      </span>
                    </div>
                    {candidate.matches.length ? (
                      <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                        Posible coincidencia: {candidate.matches.map((match) => `${match.title} (${match.region})`).join(", ")}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={candidate.productUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2 text-xs">
                        <ExternalLink size={14} aria-hidden="true" />
                        GAME
                      </a>
                      {!review ? (
                        <>
                          <button type="button" onClick={() => void createDraft(candidate)} disabled={busySku === candidate.sourceSku} className="btn-primary inline-flex items-center gap-2 text-xs">
                            <FilePlus2 size={14} aria-hidden="true" />
                            {busySku === candidate.sourceSku ? "Guardando..." : "Crear borrador"}
                          </button>
                          <button type="button" onClick={() => void dismissCandidate(candidate)} disabled={busySku === candidate.sourceSku} className="btn-secondary inline-flex items-center gap-2 text-xs">
                            <X size={14} aria-hidden="true" />
                            Descartar
                          </button>
                        </>
                      ) : review.status === "draft_created" && review.pcId ? (
                        <Link href={`/admin/cola/${review.pcId}`} className="btn-secondary text-xs">Abrir borrador</Link>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold text-muted">Descartado</span>
                      )}
                    </div>
                    {note ? (
                      <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${note.tone === "error" ? "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/20 dark:text-rose-200" : note.tone === "warning" ? "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200" : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200"}`}>
                        <p>{note.message}</p>
                        {note.matches?.length ? (
                          <ul className="mt-2 space-y-1">
                            {note.matches.map((match) => (
                              <li key={match.catalogId}>
                                <a href={match.catalogUrl} target="_blank" rel="noreferrer" className="font-semibold underline">{match.title} · {match.region}</a>
                                {` — ${match.matchReason}`}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {note.matches?.length && !review ? (
                          <button type="button" onClick={() => void createDraft(candidate, true)} className="btn-secondary mt-2 text-xs">Crear como variante distinta</button>
                        ) : null}
                        {note.redirect ? <Link href={note.redirect} className="ml-2 font-semibold underline">Abrir</Link> : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

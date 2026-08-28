"use client";

import { AlertTriangle, Copy, ExternalLink, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type { CatalogAiEnrichmentResult, CatalogAiEnrichmentPlatform } from "@/lib/catalog-ai-enrichment-campaign";
import type { LocalGameRunnerJob } from "@/lib/local-game-runner-jobs";

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
  if (status === "pending") return "Esperando PC";
  if (status === "running") return "Analizando";
  if (status === "done") return "Listo para revisar";
  if (status === "error") return "Error";
  return "Cancelado";
}

function statusTone(status: LocalGameRunnerJob["status"]): "green" | "amber" | "rose" | "neutral" {
  if (status === "done") return "green";
  if (status === "error") return "rose";
  if (status === "pending" || status === "running") return "amber";
  return "neutral";
}

function proposalTone(status: "ready" | "review" | "error"): "green" | "amber" | "rose" {
  if (status === "ready") return "green";
  if (status === "error") return "rose";
  return "amber";
}

function proposalLabel(status: "ready" | "review" | "error"): string {
  if (status === "ready") return "lista";
  if (status === "error") return "error";
  return "revisar";
}

function buildHandoff(job: LocalGameRunnerJob, result: CatalogAiEnrichmentResult): string {
  const lines = [
    "REGION_ATLAS_CATALOG_AI_V1",
    "scope=catalog_ai_enrichment_review",
    "production=https://www.regionatlas.games",
    "github=https://github.com/puntoracingrc/RegionAtlasGames",
    "rules=read-only-first; no direct production writes; apply through branch -> commit -> PR -> checks -> exact production SHA",
    `jobId=${job.id}`,
    `platform=${result.platformSlug}`,
    `model=${result.model}`,
    `generatedAt=${result.generatedAt}`,
    `selected=${result.stats.selected}`,
    `ready=${result.stats.ready}`,
    `review=${result.stats.review}`,
    `errors=${result.stats.errors}`,
    `nextCatalogId=${result.cursor.nextCatalogId ?? ""}`,
    `hasMore=${result.cursor.hasMore}`,
    "proposals=",
  ];
  for (const proposal of result.proposals) {
    lines.push(
      `- ${proposal.catalogId}|${proposal.status}|quality=${proposal.qualityScore}|sources=${proposal.sources.join(",") || "none"}|warnings=${proposal.warnings.join(" / ") || "none"}|error=${proposal.error ?? "none"}`,
    );
  }
  lines.push(
    "codex_next=inspect the referenced job result and source URLs; reject unsupported facts or copied prose; only apply approved proposals to data/game-details.json in an isolated worktree and release through the repository CI flow",
  );
  return lines.join("\n");
}

export function AdminCatalogAiCampaignPanel({ initialJobs, tokenConfigured }: Props) {
  const [jobs, setJobs] = useState(initialJobs.filter((job) => job.jobType === "catalog_enrichment"));
  const [platformSlug, setPlatformSlug] = useState<CatalogAiEnrichmentPlatform>("ps5");
  const [limit, setLimit] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ job: LocalGameRunnerJob; result: CatalogAiEnrichmentResult } | null>(null);
  const [copied, setCopied] = useState(false);
  const hasActive = jobs.some((job) => job.status === "pending" || job.status === "running");
  const handoff = useMemo(() => selected ? buildHandoff(selected.job, selected.result) : "", [selected]);

  const refreshJobs = useCallback(async () => {
    const response = await fetch("/api/admin/price-local-game-jobs", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { ok?: boolean; jobs?: LocalGameRunnerJob[] } | null;
    if (response.ok && data?.jobs) {
      setJobs(data.jobs.filter((job) => job.jobType === "catalog_enrichment"));
    }
  }, []);

  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => void refreshJobs(), 10_000);
    return () => window.clearInterval(timer);
  }, [hasActive, refreshJobs]);

  async function createJob(
    startAfterCatalogId: string | null = null,
    requestedPlatform: CatalogAiEnrichmentPlatform = platformSlug,
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/admin/price-local-game-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobType: "catalog_enrichment",
        platformSlug: requestedPlatform,
        limit,
        enrichmentMode: "missing",
        startAfterCatalogId,
      }),
    });
    const data = await response.json().catch(() => null) as { ok?: boolean; job?: LocalGameRunnerJob; error?: string } | null;
    if (!response.ok || !data?.job) {
      setError(data?.error ?? "No se pudo encolar la campaña IA.");
    } else {
      setJobs((current) => [data.job!, ...current].slice(0, 30));
      setSelected(null);
      setMessage(`Lote ${requestedPlatform.toUpperCase()} en espera del PC.`);
    }
    setBusy(false);
  }

  async function loadResult(job: LocalGameRunnerJob) {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/admin/catalog-ai-jobs/${encodeURIComponent(job.id)}/result`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      job?: LocalGameRunnerJob;
      result?: CatalogAiEnrichmentResult;
      error?: string;
    } | null;
    if (!response.ok || !data?.job || !data.result) {
      setError(data?.error ?? "No se pudo leer el informe IA.");
    } else {
      setSelected({ job: data.job, result: data.result });
    }
    setBusy(false);
  }

  async function copyHandoff() {
    if (!handoff) return;
    await navigator.clipboard.writeText(handoff);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Panel className={adminToneClass("ai")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelTitle eyebrow="Campaña local">Enriquecimiento de catálogo</PanelTitle>
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">Solo propuesta</Badge>
          <Badge tone={tokenConfigured ? "green" : "rose"}>{tokenConfigured ? "PC conectado" : "runner sin token"}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="grid content-start gap-3 rounded-lg border border-border bg-background/45 p-4">
          <label className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase text-muted">Plataforma</span>
            <select className="input" value={platformSlug} onChange={(event) => setPlatformSlug(event.target.value as CatalogAiEnrichmentPlatform)}>
              <option value="ps5">PlayStation 5</option>
              <option value="ps4">PlayStation 4</option>
              <option value="switch2">Nintendo Switch 2</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[10px] font-semibold uppercase text-muted">Fichas por lote</span>
            <input className="input" type="number" min={1} max={20} value={limit} onChange={(event) => setLimit(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} />
          </label>
          <button type="button" className="btn-primary inline-flex items-center justify-center gap-2" disabled={!tokenConfigured || busy || hasActive} onClick={() => void createJob()}>
            <Play className="h-4 w-4" aria-hidden="true" />
            Preparar propuestas
          </button>
          <button type="button" className="btn-secondary inline-flex items-center justify-center gap-2" disabled={busy} onClick={() => void refreshJobs()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Actualizar
          </button>
        </div>

        <div className="divide-y divide-border rounded-lg border border-border bg-background/45">
          {jobs.length === 0 ? (
            <p className="p-4 text-sm text-muted">Todavía no hay campañas locales.</p>
          ) : jobs.slice(0, 8).map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{job.platformSlug.toUpperCase()} · {job.limit} fichas</p>
                <p className="mt-1 text-xs text-muted">{formatDate(job.createdAt)} · {job.id}</p>
                {job.error ? <p className="mt-1 text-xs text-rose-500">{job.error}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(job.status)}>{statusLabel(job.status)}</Badge>
                {job.status === "done" ? (
                  <button type="button" className="btn-secondary px-3 py-2 text-sm" disabled={busy} onClick={() => void loadResult(job)}>
                    Revisar
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {message ? <AdminNotice tone="status">{message}</AdminNotice> : null}
      {error ? <AdminNotice tone="danger">{error}</AdminNotice> : null}

      {selected ? (
        <div className="mt-5 space-y-4 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">listas {selected.result.stats.ready}</Badge>
              <Badge tone="amber">revisar {selected.result.stats.review}</Badge>
              <Badge tone="rose">errores {selected.result.stats.errors}</Badge>
              <Badge tone="neutral">modelo {selected.result.model}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => void copyHandoff()}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? "Copiado" : "Copiar informe para Codex"}
              </button>
              {selected.result.cursor.hasMore ? (
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2"
                  disabled={busy || hasActive}
                  onClick={() => void createJob(selected.result.cursor.nextCatalogId, selected.result.platformSlug)}
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Siguiente lote
                </button>
              ) : null}
            </div>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border">
            {selected.result.proposals.map((proposal) => (
              <article key={proposal.catalogId} className="grid gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <a href={`/admin/juegos/${encodeURIComponent(proposal.catalogId)}`} className="font-semibold text-foreground hover:text-accent">
                      {proposal.title}
                    </a>
                    <p className="mt-1 text-xs text-muted">{proposal.catalogId} · {proposal.region}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={proposalTone(proposal.status)}>{proposalLabel(proposal.status)}</Badge>
                    <Badge tone="neutral">{proposal.qualityScore}/100</Badge>
                  </div>
                </div>

                {proposal.error ? (
                  <div className="flex items-start gap-2 text-sm text-rose-500">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{proposal.error}</span>
                  </div>
                ) : null}
                {proposal.warnings.length ? (
                  <p className="text-sm text-amber-600 dark:text-amber-300">{proposal.warnings.join(" ")}</p>
                ) : null}
                {proposal.descriptionPreview ? <p className="text-sm leading-6 text-muted">{proposal.descriptionPreview}</p> : null}

                <div className="flex flex-wrap gap-2">
                  {proposal.sources.map((source) => <Badge key={source} tone="green">{source}</Badge>)}
                  {proposal.fieldsUpdated.slice(0, 10).map((field) => <Badge key={field} tone="neutral">{field}</Badge>)}
                </div>
                {proposal.urls.length ? (
                  <div className="flex flex-wrap gap-2">
                    {proposal.urls.map((url, index) => (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary inline-flex items-center gap-1 px-2 py-1 text-xs">
                        Fuente {index + 1}
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <details className="rounded-lg border border-border bg-slate-950 p-4 text-emerald-100">
            <summary className="cursor-pointer text-sm font-semibold">Registro copiable</summary>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5">{handoff}</pre>
          </details>
        </div>
      ) : null}
    </Panel>
  );
}

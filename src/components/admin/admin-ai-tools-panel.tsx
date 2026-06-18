"use client";

import { useMemo, useState } from "react";
import { Badge, Panel, PanelTitle } from "@/components/ui";

type PlatformOption = { slug: string; name: string; shortName?: string };

type BatchItem = {
  pcId: number;
  title: string;
  platformSlug: string;
  region: string;
  status: "processed" | "skipped" | "error" | "dry-run";
  message: string;
  fieldsUpdated: string[];
  sources: string[];
  urls: string[];
  steamTags: string[];
  descriptionPreview: string | null;
  seoPreview: string | null;
};

type BatchReport = {
  scanned: number;
  selected: number;
  processed: number;
  saved: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
  sourceCoverage: {
    steam: number;
    official: number;
    wikipedia: number;
    existing: number;
    other: number;
  };
  fieldCoverage: Record<string, number>;
  items: BatchItem[];
};

type Props = {
  platforms: PlatformOption[];
  regions: readonly string[];
};

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/45 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black text-foreground">{value}</p>
    </div>
  );
}

function CoverageBar({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{label}</span>
        <span className="font-mono">{value} · {percentage}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-card-hover">
        <div className="h-full rounded-full bg-accent" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function statusTone(status: BatchItem["status"]): "green" | "amber" | "rose" | "neutral" {
  if (status === "processed") return "green";
  if (status === "dry-run") return "amber";
  if (status === "error") return "rose";
  return "neutral";
}

function statusLabel(status: BatchItem["status"]): string {
  if (status === "processed") return "guardado";
  if (status === "dry-run") return "previsualizado";
  if (status === "error") return "error";
  return "saltado";
}

function mergeReportItem(report: BatchReport, incoming: BatchItem): BatchReport {
  const items = report.items.map((item) => (item.pcId === incoming.pcId ? incoming : item));
  if (!items.some((item) => item.pcId === incoming.pcId)) items.unshift(incoming);
  return { ...report, items };
}

function truncate(value: string | null, size = 260): string {
  if (!value) return "";
  return value.length > size ? `${value.slice(0, size).trim()}…` : value;
}

export function AdminAiToolsPanel({ platforms, regions }: Props) {
  const [platformSlug, setPlatformSlug] = useState("all");
  const [region, setRegion] = useState("all");
  const [status, setStatus] = useState("pending-catalog");
  const [mode, setMode] = useState<"missing" | "force">("missing");
  const [limit, setLimit] = useState(10);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeDescription, setIncludeDescription] = useState(true);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [rerunningPcId, setRerunningPcId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BatchReport | null>(null);

  const processedTotal = report?.processed ?? 0;
  const fieldEntries = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.fieldCoverage).sort((a, b) => b[1] - a[1]);
  }, [report]);

  async function postBatch(payload: Record<string, unknown>): Promise<BatchReport | null> {
    const res = await fetch("/api/admin/ai-fill-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo lanzar el lote de IA.");
      return null;
    }
    return data.report as BatchReport;
  }

  async function runBatch() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const nextReport = await postBatch({
        platformSlug,
        region,
        status,
        mode,
        limit,
        includeMetadata,
        includeDescription,
        dryRun,
      });
      if (nextReport) setReport(nextReport);
    } catch {
      setError("Error de red al lanzar la IA.");
    } finally {
      setLoading(false);
    }
  }

  async function rerunItem(pcId: number, nextDryRun = dryRun) {
    setRerunningPcId(pcId);
    setError(null);
    try {
      const singleReport = await postBatch({
        pcIds: [pcId],
        platformSlug: "all",
        region: "all",
        status: "all",
        mode: "force",
        limit: 1,
        includeMetadata,
        includeDescription,
        dryRun: nextDryRun,
      });
      const nextItem = singleReport?.items[0];
      if (nextItem) {
        setReport((current) => (current ? mergeReportItem(current, nextItem) : singleReport));
      }
    } catch {
      setError("Error de red al relanzar esa ficha.");
    } finally {
      setRerunningPcId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelTitle eyebrow="IA de fichas">Completar borradores por lote</PanelTitle>
        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <p className="text-sm leading-6 text-muted">
              Lanza la misma IA del editor individual: busca fuentes oficiales, usa Steam como referencia
              experimental cuando encuentra coincidencia clara, recoge etiquetas populares y genera textos
              SEO sin cambiar rutas, plataforma ni región. En simulación genera una previsualización real,
              pero no guarda nada.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Modo" value={mode === "missing" ? "Solo huecos" : "Forzar"} />
              <Stat label="Límite" value={limit} />
              <Stat label="Ejecución" value={dryRun ? "Previsualizar" : "Guardar"} />
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-border bg-background/45 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span>
                <select className="input" value={platformSlug} onChange={(e) => setPlatformSlug(e.target.value)}>
                  <option value="all">Todas</option>
                  {platforms.map((platform) => (
                    <option key={platform.slug} value={platform.slug}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Región</span>
                <select className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
                  <option value="all">Todas</option>
                  {regions.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Estado</span>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="pending-catalog">Pendientes</option>
                  <option value="enriched">Enriquecidas</option>
                  <option value="all">Todas no publicadas</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Modo</span>
                <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "missing" | "force")}>
                  <option value="missing">Solo rellenar huecos</option>
                  <option value="force">Forzar regeneración</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">Cantidad</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                />
              </label>
            </div>

            <div className="grid gap-2 text-sm text-muted">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={includeMetadata} onChange={(e) => setIncludeMetadata(e.target.checked)} />
                Completar metadatos de ficha: año, compañías, géneros y jugadores
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={includeDescription} onChange={(e) => setIncludeDescription(e.target.checked)} />
                Completar descripción, metadatos SEO, FAQs y destacados
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Previsualizar primero, no guardar cambios
              </label>
            </div>

            <button type="button" className="btn-primary" disabled={loading} onClick={() => void runBatch()}>
              {loading ? "Trabajando…" : dryRun ? "Previsualizar lote IA" : "Lanzar lote IA"}
            </button>
          </div>
        </div>
      </Panel>

      {error ? (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {report ? (
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <PanelTitle eyebrow="Resultado">Lote IA</PanelTitle>
            <Badge tone={report.errors > 0 ? "rose" : report.dryRun ? "amber" : "green"}>
              {report.dryRun ? "previsualización" : "guardado"}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Stat label="Candidatas" value={report.scanned} />
            <Stat label="Seleccionadas" value={report.selected} />
            <Stat label="Procesadas" value={report.processed} />
            <Stat label="Guardadas" value={report.saved} />
            <Stat label="Saltadas" value={report.skipped} />
            <Stat label="Errores" value={report.errors} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-border bg-background/45 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Mapa de fuentes</p>
              <div className="mt-3 grid gap-3">
                <CoverageBar label="Steam" value={report.sourceCoverage.steam} total={processedTotal} />
                <CoverageBar label="Oficiales / fiables" value={report.sourceCoverage.official} total={processedTotal} />
                <CoverageBar label="Wikipedia / Wikidata" value={report.sourceCoverage.wikipedia} total={processedTotal} />
                <CoverageBar label="Datos existentes" value={report.sourceCoverage.existing} total={processedTotal} />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/45 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Campos tocados</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {fieldEntries.length ? fieldEntries.map(([field, count]) => (
                  <Badge key={field} tone="neutral">{field}: {count}</Badge>
                )) : <span className="text-sm text-muted">Sin cambios detectados.</span>}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {report.items.map((item) => (
              <article key={`${item.pcId}-${item.status}`} className="rounded-2xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <a href={`/admin/cola/${item.pcId}`} className="font-semibold text-foreground hover:text-accent">
                      {item.title}
                    </a>
                    <p className="mt-1 text-xs text-muted">
                      {item.platformSlug.toUpperCase()} · {item.region} · <span className="font-mono">{item.pcId}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-2 text-sm"
                      disabled={rerunningPcId === item.pcId || loading}
                      onClick={() => void rerunItem(item.pcId, true)}
                    >
                      {rerunningPcId === item.pcId ? "Rehaciendo…" : "Rehacer preview"}
                    </button>
                    <button
                      type="button"
                      className="btn-primary px-3 py-2 text-sm"
                      disabled={rerunningPcId === item.pcId || loading}
                      onClick={() => void rerunItem(item.pcId, false)}
                    >
                      Guardar IA
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted">{item.message}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {item.sources.map((source) => <Badge key={source} tone="green">{source}</Badge>)}
                  {item.steamTags.slice(0, 8).map((tag) => <Badge key={tag} tone="amber">Steam: {tag}</Badge>)}
                  {item.fieldsUpdated.slice(0, 10).map((field) => <Badge key={field} tone="neutral">{field}</Badge>)}
                </div>

                {item.descriptionPreview || item.seoPreview ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {item.descriptionPreview ? (
                      <div className="rounded-xl border border-border bg-card/50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Descripción preview</p>
                        <p className="mt-2 text-sm leading-6 text-muted">{truncate(item.descriptionPreview)}</p>
                      </div>
                    ) : null}
                    {item.seoPreview ? (
                      <div className="rounded-xl border border-border bg-card/50 p-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">SEO preview</p>
                        <p className="mt-2 text-sm leading-6 text-muted">{truncate(item.seoPreview, 180)}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {item.urls.length ? (
                  <details className="mt-3 rounded-xl border border-border bg-card/40 p-3 text-sm text-muted">
                    <summary className="cursor-pointer font-medium text-foreground">URLs consultadas ({item.urls.length})</summary>
                    <div className="mt-2 grid gap-1">
                      {item.urls.slice(0, 8).map((url) => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
                          {url}
                        </a>
                      ))}
                    </div>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

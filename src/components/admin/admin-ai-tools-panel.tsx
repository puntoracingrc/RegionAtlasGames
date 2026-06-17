"use client";

import { useState } from "react";
import { Badge, Panel, PanelTitle } from "@/components/ui";

type PlatformOption = { slug: string; name: string; shortName?: string };

type BatchReport = {
  scanned: number;
  selected: number;
  processed: number;
  saved: number;
  skipped: number;
  errors: number;
  dryRun: boolean;
  items: Array<{
    pcId: number;
    title: string;
    status: "processed" | "skipped" | "error" | "dry-run";
    message: string;
  }>;
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

function statusTone(status: BatchReport["items"][number]["status"]): "green" | "amber" | "rose" | "neutral" {
  if (status === "processed") return "green";
  if (status === "dry-run") return "amber";
  if (status === "error") return "rose";
  return "neutral";
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
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BatchReport | null>(null);

  async function runBatch() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/admin/ai-fill-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformSlug,
          region,
          status,
          mode,
          limit,
          includeMetadata,
          includeDescription,
          dryRun,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo lanzar el lote de IA.");
        return;
      }
      setReport(data.report);
    } catch {
      setError("Error de red al lanzar la IA.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelTitle eyebrow="IA de fichas">Completar borradores por lote</PanelTitle>
        <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-2xl border border-border bg-background/45 p-4">
            <p className="text-sm leading-6 text-muted">
              Lanza la misma IA del editor individual sobre fichas en revisión. Completa descripción,
              metadatos de catálogo y metadatos SEO, pero nunca cambia rutas, plataforma ni región.
              Por defecto está en modo simulación y solo rellena huecos.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Modo" value={mode === "missing" ? "Solo huecos" : "Forzar"} />
              <Stat label="Límite" value={limit} />
              <Stat label="Ejecución" value={dryRun ? "Simular" : "Real"} />
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
                Simular primero, no guardar cambios
              </label>
            </div>

            <button type="button" className="btn-primary" disabled={loading} onClick={() => void runBatch()}>
              {loading ? "Trabajando…" : dryRun ? "Simular lote IA" : "Lanzar lote IA"}
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
              {report.dryRun ? "simulación" : "guardado"}
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

          <div className="mt-4 overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-card-hover text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2">Ficha</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Mensaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.items.map((item) => (
                  <tr key={`${item.pcId}-${item.status}`}>
                    <td className="px-3 py-2">
                      <a href={`/admin/cola/${item.pcId}`} className="font-medium text-foreground hover:text-accent">
                        {item.title}
                      </a>
                      <p className="font-mono text-[11px] text-muted">{item.pcId}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted">{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

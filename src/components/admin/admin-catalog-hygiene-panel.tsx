"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  LockKeyhole,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import {
  catalogHygieneDecision,
  summarizeCatalogHygiene,
  type CatalogHygieneDecision,
  type CatalogHygieneDecisionSummary,
} from "@/lib/catalog-hygiene-decision";
import type {
  CatalogEntityAuditIssue,
  CatalogEntityAuditReport,
  CatalogEntityAuditStatus,
  CatalogEntityMigrationPlan,
} from "@/lib/admin-catalog-hygiene";

type AuditState = {
  status: CatalogEntityAuditStatus | null;
  report: CatalogEntityAuditReport | null;
  migrationPlanStatus: CatalogEntityAuditStatus | null;
  migrationPlan: CatalogEntityMigrationPlan | null;
  workerBaseUrl: string | null;
};

const EMPTY_SUMMARY: CatalogHygieneDecisionSummary = {
  catalogRecords: 0,
  totalRecords: 0,
  runtimeProtectedRecords: 0,
  preservedIdentifierRecords: 0,
  preservedSourcePathRecords: 0,
  manualReviewRecords: 0,
  collisionRecords: 0,
  byDecision: {
    runtime_decode: 0,
    preserve_identifier: 0,
    preserve_source_path: 0,
    manual_collision: 0,
    manual_review: 0,
  },
};

function numberLabel(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString("es-ES") : "0";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function statusLabel(status: string | undefined): string {
  if (status === "pending") return "Esperando PC";
  if (status === "running") return "Ejecutando en PC";
  if (status === "done") return "Terminado";
  if (status === "error") return "Error";
  return "Sin informe";
}

function sourceLabel(source: string | undefined): string {
  if (source === "catalog") return "Catálogo";
  if (source === "game-details") return "Detalles";
  if (source === "price-review-queue") return "Cola de precios";
  return source ?? "Otro";
}

function decisionLabel(decision: CatalogHygieneDecision): string {
  if (decision === "runtime_decode") return "Corregido en web";
  if (decision === "preserve_identifier") return "ID conservado";
  if (decision === "preserve_source_path") return "Ruta congelada";
  if (decision === "manual_collision") return "Conflicto bloqueado";
  return "Revisar";
}

function decisionTone(decision: CatalogHygieneDecision): "green" | "amber" | "rose" | "neutral" {
  if (decision === "runtime_decode") return "green";
  if (decision === "manual_collision" || decision === "manual_review") return "rose";
  if (decision === "preserve_source_path") return "amber";
  return "neutral";
}

function decisionExplanation(issue: CatalogEntityAuditIssue): string {
  const decision = catalogHygieneDecision(issue);
  if (decision === "runtime_decode") return issue.decodedValue ?? "Texto decodificado al mostrarlo.";
  if (decision === "preserve_identifier") return "Se mantiene para no romper enlaces, precios ni colecciones.";
  if (decision === "preserve_source_path") return "No se cambia sin verificar primero la URL en su fuente.";
  if (decision === "manual_collision") return `No aplicar: ${issue.suggestedId ?? "el destino"} ya existe.`;
  return issue.decodedValue ?? "Necesita revisión técnica antes de actuar.";
}

function issueLabel(issue: CatalogEntityAuditIssue): string {
  const field = issue.field ? ` · ${issue.field}` : "";
  return `${sourceLabel(issue.source)}${field}`;
}

function isErrorResponse(data: unknown): data is { error: string } {
  return Boolean(
    data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string",
  );
}

function buildHandoff(
  state: AuditState | null,
  summary: CatalogHygieneDecisionSummary,
  issues: CatalogEntityAuditIssue[],
): string {
  const lines = [
    "REGION_ATLAS_CATALOG_HYGIENE_V2",
    "scope=catalog_hygiene_review",
    "production=https://www.regionatlas.games",
    "github=https://github.com/puntoracingrc/RegionAtlasGames",
    "local_repo=/Users/macbookpro14/Projects/pal-es-market",
    "rules=read-only-first; preserve stable catalog IDs; never edit collections, prices, overlays or production data directly",
    "deploy_flow=branch -> commit -> push -> PR -> checks -> merge -> main CI -> verify exact production SHA",
    `reportVersion=${state?.report?.schemaVersion ?? 1}`,
    `generatedAt=${state?.report?.generatedAt ?? state?.status?.finishedAt ?? "unknown"}`,
    `workerStatus=${state?.status?.status ?? "unknown"}`,
    `workerId=${state?.status?.runnerId ?? "unknown"}`,
    `rawIssues=${state?.report?.summary?.totalIssues ?? issues.length}`,
    `catalogRecords=${summary.catalogRecords}`,
    `runtimeProtectedRecords=${summary.runtimeProtectedRecords}`,
    `preservedIdentifierRecords=${summary.preservedIdentifierRecords}`,
    `preservedSourcePathRecords=${summary.preservedSourcePathRecords}`,
    `manualReviewRecords=${summary.manualReviewRecords}`,
    `collisionRecords=${summary.collisionRecords}`,
    "policy=decode presentation text at runtime; keep IDs/slugs/detail keys stable; hold external paths; block collisions",
    "samples=",
  ];
  for (const issue of issues.slice(0, 20)) {
    lines.push(
      `- ${catalogHygieneDecision(issue)}|${issue.source ?? "unknown"}|${issue.recordId ?? "unknown"}|${issue.field ?? "unknown"}|${issue.value ?? ""}`,
    );
  }
  lines.push(
    "codex_next=inspect this report against current origin/main; do not rename IDs unless every repository, Blob and user-data reference has a tested alias/migration/rollback path",
  );
  return lines.join("\n");
}

export function AdminCatalogHygienePanel() {
  const [openedAt] = useState(() => Date.now());
  const [state, setState] = useState<AuditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [planTarget, setPlanTarget] = useState<"percent27" | "html_amp" | "all">("percent27");
  const [page, setPage] = useState(1);

  const active = state?.status?.status === "pending" || state?.status?.status === "running";
  const planActive =
    state?.migrationPlanStatus?.status === "pending" ||
    state?.migrationPlanStatus?.status === "running";
  const reportTimestamp = state?.report?.generatedAt ?? state?.status?.finishedAt;
  const parsedReportTime = reportTimestamp ? Date.parse(reportTimestamp) : Number.NaN;
  const reportStale = Number.isFinite(parsedReportTime) && openedAt - parsedReportTime > 7 * 24 * 60 * 60 * 1000;
  const allIssues = useMemo(
    () => state?.report?.issues ?? state?.report?.examples ?? [],
    [state?.report],
  );
  const decisionSummary = useMemo(
    () => (allIssues.length ? summarizeCatalogHygiene(allIssues) : EMPTY_SUMMARY),
    [allIssues],
  );
  const filteredIssues = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return allIssues.filter((issue) => {
      const decision = catalogHygieneDecision(issue);
      if (decisionFilter !== "all" && decision !== decisionFilter) return false;
      if (sourceFilter !== "all" && issue.source !== sourceFilter) return false;
      if (!cleanQuery) return true;
      return [
        issue.recordId,
        issue.field,
        issue.value,
        issue.decodedValue,
        issue.title,
        issue.suggestedId,
        issue.source,
        issue.kind,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(cleanQuery);
    });
  }, [allIssues, decisionFilter, query, sourceFilter]);
  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(filteredIssues.length / pageSize));
  const visibleIssues = filteredIssues.slice((page - 1) * pageSize, page * pageSize);
  const handoff = useMemo(
    () => buildHandoff(state, decisionSummary, allIssues),
    [allIssues, decisionSummary, state],
  );

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/catalog-hygiene", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as AuditState | { error: string } | null;
      if (!response.ok || !data || isErrorResponse(data)) {
        setMessage(isErrorResponse(data) ? data.error : "No se pudo leer el informe de higiene.");
        return;
      }
      setState(data);
      setPage(1);
    } catch {
      setMessage("No se pudo conectar con el informe de higiene.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function startAudit() {
    setStarting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/catalog-hygiene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "audit" }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok || data?.error) {
        setMessage(data?.error ?? "No se pudo enviar el escaneo al PC.");
        return;
      }
      setMessage(data?.message ?? "Escaneo enviado al PC.");
      await loadState();
    } finally {
      setStarting(false);
    }
  }

  async function startMigrationPlan() {
    setPlanning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/catalog-hygiene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "migration-plan", target: planTarget }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok || data?.error) {
        setMessage(data?.error ?? "No se pudo generar la simulación.");
        return;
      }
      setMessage(data?.message ?? "Simulación enviada al PC.");
      await loadState();
    } finally {
      setPlanning(false);
    }
  }

  async function copyHandoff() {
    await navigator.clipboard.writeText(handoff);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadState(), 0);
    return () => window.clearTimeout(timer);
  }, [loadState]);

  useEffect(() => {
    if (!active && !planActive) return;
    const timer = window.setInterval(() => void loadState(), 10000);
    return () => window.clearInterval(timer);
  }, [active, planActive, loadState]);

  return (
    <Panel className={adminToneClass("status")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <PanelTitle eyebrow="Higiene">Control de calidad del catálogo</PanelTitle>
          <p className="max-w-4xl text-sm leading-6 text-muted">
            Detecta residuos de importación y decide qué puede corregirse sin cambiar identidades ni romper datos relacionados.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="green">Texto protegido</Badge>
            <Badge tone="neutral">IDs estables</Badge>
            <Badge tone="amber">Sin borrados automáticos</Badge>
            {reportStale ? <Badge tone="rose">Informe antiguo</Badge> : null}
            {planActive ? <Badge tone="amber">Simulación esperando PC</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={() => void loadState()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Actualizar
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            onClick={() => void startAudit()}
            disabled={starting || active}
          >
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
            {starting ? "Enviando" : active ? statusLabel(state?.status?.status) : "Escanear en PC"}
          </button>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={() => void copyHandoff()}
            disabled={!state?.report}
          >
            <Clipboard className="h-4 w-4" aria-hidden="true" />
            {copied ? "Copiado" : "Copiar para Codex"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4">
          <AdminNotice tone={message.includes("No se") ? "danger" : "status"}>{message}</AdminNotice>
        </div>
      ) : null}

      {reportStale ? (
        <div className="mt-4 flex gap-3 border-l-4 border-amber-500 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm leading-6 text-muted">
            El último escaneo es del <b className="text-foreground">{formatDate(reportTimestamp)}</b>. Úsalo como referencia histórica y vuelve a escanear cuando el PC worker esté encendido.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex gap-3 border-l-4 border-emerald-500 bg-emerald-500/8 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">Decisión automática conservadora</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            La web corrige entidades HTML solo al mostrar texto. Los IDs, slugs, claves de detalles y rutas externas permanecen intactos. Cualquier colisión queda bloqueada para revisión.
          </p>
        </div>
      </div>

      <dl className="mt-5 grid overflow-hidden rounded-lg border border-border bg-background/45 md:grid-cols-4 md:divide-x md:divide-border">
        <div className="border-b border-border p-4 md:border-b-0">
          <dt className="text-xs font-semibold text-muted">Fichas detectadas</dt>
          <dd className="mt-1 text-2xl font-bold">{numberLabel(decisionSummary.catalogRecords)}</dd>
        </div>
        <div className="border-b border-border p-4 md:border-b-0">
          <dt className="text-xs font-semibold text-muted">Texto protegido en web</dt>
          <dd className="mt-1 text-2xl font-bold text-emerald-700">{numberLabel(decisionSummary.runtimeProtectedRecords)}</dd>
        </div>
        <div className="border-b border-border p-4 md:border-b-0">
          <dt className="text-xs font-semibold text-muted">IDs de fichas conservados</dt>
          <dd className="mt-1 text-2xl font-bold">{numberLabel(decisionSummary.preservedIdentifierRecords)}</dd>
        </div>
        <div className="p-4">
          <dt className="text-xs font-semibold text-muted">Conflictos bloqueados</dt>
          <dd className={`mt-1 text-2xl font-bold ${decisionSummary.collisionRecords ? "text-rose-700" : "text-emerald-700"}`}>
            {numberLabel(decisionSummary.collisionRecords)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span>Estado: <b className="text-foreground">{statusLabel(state?.status?.status)}</b></span>
        <span>Último informe: <b className="text-foreground">{formatDate(reportTimestamp)}</b></span>
        <span>PC: <b className="text-foreground">{state?.status?.runnerId ?? "Sin confirmar"}</b></span>
        <span>Hallazgos de campos: <b className="text-foreground">{numberLabel(state?.report?.summary?.totalIssues)}</b></span>
      </div>

      {state?.status?.error ? (
        <div className="mt-4">
          <AdminNotice tone="danger">{state.status.error}</AdminNotice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 border-y border-border py-5 lg:grid-cols-3">
        <div className="flex gap-3 border-l-4 border-emerald-500 pl-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div>
            <p className="font-semibold">Automático</p>
            <p className="mt-1 text-sm text-muted">Títulos y descripciones se muestran decodificados sin alterar el fichero fuente.</p>
          </div>
        </div>
        <div className="flex gap-3 border-l-4 border-slate-400 pl-3">
          <LockKeyhole className="h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
          <div>
            <p className="font-semibold">Conservar</p>
            <p className="mt-1 text-sm text-muted">IDs y claves siguen siendo compatibles con precios, índices, Blob y colecciones.</p>
          </div>
        </div>
        <div className="flex gap-3 border-l-4 border-amber-500 pl-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p className="font-semibold">Bloquear</p>
            <p className="mt-1 text-sm text-muted">Rutas externas y colisiones no cambian hasta que exista verificación y rollback completos.</p>
          </div>
        </div>
      </div>

      {allIssues.length ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 lg:grid-cols-[200px_180px_1fr_auto]">
            <label className="grid gap-1 text-xs font-semibold text-muted">
              <span>Decisión</span>
              <select
                className="input"
                value={decisionFilter}
                onChange={(event) => {
                  setDecisionFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Todas</option>
                <option value="runtime_decode">Corregido en web</option>
                <option value="preserve_identifier">ID conservado</option>
                <option value="preserve_source_path">Ruta congelada</option>
                <option value="manual_collision">Conflicto bloqueado</option>
                <option value="manual_review">Revisar</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted">
              <span>Origen</span>
              <select
                className="input"
                value={sourceFilter}
                onChange={(event) => {
                  setSourceFilter(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Todos</option>
                <option value="catalog">Catálogo</option>
                <option value="game-details">Detalles</option>
                <option value="price-review-queue">Cola de precios</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted">
              <span>Buscar</span>
              <input
                className="input"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Título, ID o campo"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="btn-secondary w-full"
                onClick={() => {
                  setDecisionFilter("all");
                  setSourceFilter("all");
                  setQuery("");
                  setPage(1);
                }}
              >
                Limpiar filtros
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm text-muted md:flex-row md:items-center md:justify-between">
            <p>
              Mostrando {numberLabel(visibleIssues.length)} de {numberLabel(filteredIssues.length)} hallazgos filtrados.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Anterior
              </button>
              <span className="text-xs font-semibold">{page} / {totalPages}</span>
              <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                Siguiente
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="hidden grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-border bg-background/70 px-4 py-3 text-xs font-semibold text-muted md:grid">
              <span>Decisión</span>
              <span>Hallazgo</span>
              <span>Tratamiento</span>
            </div>
            {visibleIssues.map((issue, index) => {
              const decision = catalogHygieneDecision(issue);
              return (
                <div key={`${issue.recordId}-${issue.field}-${index}`} className="grid gap-3 border-b border-border px-4 py-4 text-xs last:border-b-0 md:grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)]">
                  <span><Badge tone={decisionTone(decision)}>{decisionLabel(decision)}</Badge></span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{issueLabel(issue)}</span>
                    {issue.recordId ? <span className="mt-1 block break-all text-muted">{issue.recordId}</span> : null}
                    <span className="mt-1 block break-all text-muted">{issue.value}</span>
                  </span>
                  <span className="break-all text-muted">{decisionExplanation(issue)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <AdminNotice tone="status">Aún no hay informe. Ejecuta un escaneo cuando el PC worker esté encendido.</AdminNotice>
        </div>
      )}

      <details className="mt-6 border-t border-border pt-5">
        <summary className="cursor-pointer font-semibold text-foreground">Diagnóstico avanzado de IDs heredados</summary>
        <div className="mt-4 border-l-4 border-amber-500 bg-amber-500/8 px-4 py-3 text-sm leading-6 text-muted">
          Esta simulación no modifica datos. Un cambio real de IDs seguirá bloqueado hasta cubrir catálogo, detalles, índices, precios, Blob, overlays, colecciones y redirecciones con rollback probado.
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid min-w-56 gap-1 text-xs font-semibold text-muted">
            <span>Patrón a simular</span>
            <select className="input" value={planTarget} onChange={(event) => setPlanTarget(event.target.value as typeof planTarget)}>
              <option value="percent27">Apóstrofes %27</option>
              <option value="html_amp">Entidades &amp;amp;</option>
              <option value="all">Todos los escapes</option>
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            onClick={() => void startMigrationPlan()}
            disabled={planning || planActive}
          >
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
            {planning ? "Enviando" : planActive ? statusLabel(state?.migrationPlanStatus?.status) : "Generar simulación"}
          </button>
          <Badge tone={state?.migrationPlanStatus?.status === "error" ? "rose" : planActive ? "amber" : "neutral"}>
            {statusLabel(state?.migrationPlanStatus?.status)}
          </Badge>
        </div>

        {state?.migrationPlan ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">
              {numberLabel(state.migrationPlan.summary?.totalItems)} IDs simulados · {numberLabel(state.migrationPlan.summary?.safeToApply)} sin colisión técnica · {numberLabel(state.migrationPlan.summary?.conflicts)} conflictos. “Sin colisión” no significa autorizado para aplicar.
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              {(state.migrationPlan.items ?? []).slice(0, 20).map((item) => (
                <div key={item.oldId} className="grid gap-2 border-b border-border px-4 py-3 text-xs last:border-b-0 md:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)]">
                  <span><Badge tone={item.conflict ? "rose" : "amber"}>{item.conflict ? "Conflicto" : "Simulación"}</Badge></span>
                  <span className="break-all"><b>Actual:</b> {item.oldId}<span className="mt-1 block text-muted">{item.title}</span></span>
                  <span className="break-all text-muted"><b>Propuesto:</b> {item.newId}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </details>
    </Panel>
  );
}

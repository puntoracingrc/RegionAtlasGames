"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminNotice, adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import type { CatalogEntityAuditIssue, CatalogEntityAuditReport, CatalogEntityAuditStatus } from "@/lib/admin-catalog-hygiene";

type AuditState = {
  status: CatalogEntityAuditStatus | null;
  report: CatalogEntityAuditReport | null;
  workerBaseUrl: string | null;
};

function numberLabel(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString("es-ES") : "0";
}

function statusLabel(status: string | undefined): string {
  if (status === "pending") return "Esperando PC";
  if (status === "running") return "Ejecutando en PC";
  if (status === "done") return "Terminado";
  if (status === "error") return "Error";
  return "Sin informe";
}

function severityLabel(value: string | undefined): string {
  if (value === "critical") return "Crítico";
  if (value === "warning") return "Aviso";
  if (value === "text") return "Texto";
  return value ?? "-";
}

function issueLabel(issue: CatalogEntityAuditIssue): string {
  const field = issue.field ? ` · ${issue.field}` : "";
  return `${issue.source ?? "catálogo"}${field}`;
}

function isErrorResponse(data: unknown): data is { error: string } {
  return Boolean(data && typeof data === "object" && "error" in data && typeof (data as { error?: unknown }).error === "string");
}

export function AdminCatalogHygienePanel() {
  const [state, setState] = useState<AuditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const active = state?.status?.status === "pending" || state?.status?.status === "running";
  const examples = useMemo(() => state?.report?.examples?.slice(0, 8) ?? [], [state?.report]);

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
    } finally {
      setLoading(false);
    }
  }, []);

  async function startAudit() {
    setStarting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/catalog-hygiene", { method: "POST" });
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

  useEffect(() => {
    const timer = window.setTimeout(() => void loadState(), 0);
    return () => window.clearTimeout(timer);
  }, [loadState]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void loadState(), 10000);
    return () => window.clearInterval(timer);
  }, [active, loadState]);

  return (
    <Panel className={adminToneClass("status")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <PanelTitle eyebrow="Higiene">Entidades raras en catálogo</PanelTitle>
          <p className="max-w-4xl text-sm leading-6 text-muted">
            Escanea fichas con textos escapados en IDs, slugs, títulos, detalles y cola de precios. El PC hace el trabajo y la web solo muestra el resultado.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary" onClick={() => void loadState()} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
          <button type="button" className="btn-primary" onClick={() => void startAudit()} disabled={starting || active}>
            {starting ? "Enviando..." : active ? statusLabel(state?.status?.status) : "Escanear en PC"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4">
          <AdminNotice tone={message.includes("No se") ? "danger" : "status"}>{message}</AdminNotice>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Estado</p>
          <p className="mt-2 text-lg font-black">{statusLabel(state?.status?.status)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Total</p>
          <p className="mt-2 text-lg font-black">{numberLabel(state?.report?.summary?.totalIssues ?? state?.status?.summary?.totalIssues)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Críticas</p>
          <p className="mt-2 text-lg font-black">{numberLabel(state?.report?.summary?.bySeverity?.critical ?? state?.status?.summary?.bySeverity?.critical)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-background/60 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Último PC</p>
          <p className="mt-2 break-words text-sm font-black">{state?.status?.runnerId ?? "Pendiente"}</p>
        </div>
      </div>

      {state?.status?.error ? (
        <div className="mt-4">
          <AdminNotice tone="danger">{state.status.error}</AdminNotice>
        </div>
      ) : null}

      {examples.length ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[110px_1fr_1fr] gap-3 border-b border-border bg-background/70 px-4 py-3 text-xs font-black text-muted">
            <span>Tipo</span>
            <span>Actual</span>
            <span>Sugerencia</span>
          </div>
          {examples.map((issue, index) => (
            <div key={`${issue.recordId}-${issue.field}-${index}`} className="grid grid-cols-[110px_1fr_1fr] gap-3 border-b border-border px-4 py-3 text-xs last:border-b-0">
              <span className="font-black">{severityLabel(issue.severity)}</span>
              <span className="min-w-0">
                <span className="block font-semibold">{issueLabel(issue)}</span>
                <span className="block break-all text-muted">{issue.value}</span>
              </span>
              <span className="break-all text-emerald-700">{issue.suggestedId ?? issue.decodedValue ?? "-"}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5">
          <AdminNotice tone="status">
            Aún no hay ejemplos cargados. Ejecuta el escaneo en PC o pulsa actualizar si ya lo lanzaste.
          </AdminNotice>
        </div>
      )}

      {state?.workerBaseUrl ? (
        <p className="mt-4 break-all text-xs text-muted">
          Informe worker: {state.workerBaseUrl}/app/data/admin/catalog-html-entity-audit.json
        </p>
      ) : null}
    </Panel>
  );
}

"use client";

import { useState } from "react";
import type { GamePastePreview, LocalGameRunnerJob, LocalGameRunnerOfferType } from "@/lib/local-game-runner-jobs";

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
  const [startPage, setStartPage] = useState(0);
  const [maxPages, setMaxPages] = useState(2);
  const [skipRecentDays, setSkipRecentDays] = useState(7);
  const [state, setState] = useState<"idle" | "saving" | "error" | "saved">("idle");
  const [importingJobId, setImportingJobId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pastePreview, setPastePreview] = useState<GamePastePreview | null>(null);
  const [pasteState, setPasteState] = useState<"idle" | "previewing" | "importing" | "error" | "done">("idle");
  const [pasteMessage, setPasteMessage] = useState("");
  const [pasteLog, setPasteLog] = useState("");

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
      body: JSON.stringify({ platformSlug, offerType, limit, startPage, maxPages, skipRecentDays }),
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

  async function importJob(jobId: string) {
    setImportingJobId(jobId);
    setMessage("");
    const response = await fetch(`/api/admin/price-local-game-jobs/${encodeURIComponent(jobId)}/import`, { method: "POST" });
    const data = await response.json().catch(() => null) as { ok?: boolean; job?: LocalGameRunnerJob; error?: string } | null;
    setImportingJobId(null);
    if (!response.ok || !data?.ok || !data.job) {
      setState("error");
      setMessage(data?.error ?? "No se pudo importar el resultado GAME local.");
      return;
    }
    setJobs((current) => current.map((job) => (job.id === jobId ? data.job! : job)));
    setState("saved");
    setMessage("Resultado GAME importado al flujo del worker. Los dudosos quedan en Precios a revisar.");
  }

  async function previewPaste() {
    setPasteState("previewing");
    setPasteMessage("");
    setPasteLog("");
    const response = await fetch("/api/admin/price-game-paste/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pastedText: pasteText }),
    });
    const data = await response.json().catch(() => null) as { ok?: boolean; preview?: GamePastePreview; error?: string } | null;
    if (!response.ok || !data?.ok || !data.preview) {
      setPasteState("error");
      setPasteMessage(data?.error ?? "No se pudo previsualizar el pegado de GAME.");
      return;
    }
    setPastePreview(data.preview);
    setPasteState("idle");
    setPasteMessage(`Detectados ${data.preview.stats.parsedProducts} productos. Revisa y confirma si quieres importarlos.`);
  }

  async function importPaste() {
    setPasteState("importing");
    setPasteMessage("");
    setPasteLog("");
    const response = await fetch("/api/admin/price-game-paste/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platformSlug, offerType, pastedText: pasteText }),
    });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      preview?: GamePastePreview;
      resultPath?: string;
      importLogTail?: string | null;
      error?: string;
    } | null;
    if (data?.preview) setPastePreview(data.preview);
    if (data?.importLogTail) setPasteLog(data.importLogTail);
    if (!response.ok || !data?.ok) {
      setPasteState("error");
      setPasteMessage(`${data?.error ?? "No se pudo importar el pegado de GAME."}${data?.importLogTail ? " Revisa el log de abajo para ver la causa real." : ""}`);
      return;
    }
    setPasteState("done");
    setPasteLog(data.importLogTail ?? "");
    setPasteMessage(`Importado al worker: ${data.resultPath}. Los seguros se aplican; los dudosos quedan en Precios a revisar.`);
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

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
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
        <label className="text-xs font-semibold text-muted">
          Páginas a explorar
          <input type="number" min={1} max={8} value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value) || 1)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <button type="button" onClick={createJob} disabled={state === "saving"} className="btn-primary self-end">
          {state === "saving" ? "Creando..." : "Lanzar GAME desde Mac"}
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-muted">
          Empezar en página
          <input type="number" min={0} max={20} value={startPage} onChange={(event) => setStartPage(Number(event.target.value) || 0)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="text-xs font-semibold text-muted">
          Evitar repetidos de los últimos días
          <input type="number" min={0} max={30} value={skipRecentDays} onChange={(event) => setSkipRecentDays(Number(event.target.value) || 0)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground" />
          <span className="mt-1 block text-[11px] font-normal leading-4 text-muted">0 = no filtrar. Recomendado: 7 días para seguir con productos nuevos.</span>
        </label>
      </div>

      {message ? (
        <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${state === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
          {message}
        </p>
      ) : null}

      <div className="mt-6 rounded-3xl border border-amber-300/70 bg-amber-50/70 p-4 dark:border-amber-400/30 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700 dark:text-amber-300">GAME pegado manual</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-foreground">Pegar catálogo seminuevo de GAME</h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">
              Pega el texto tal cual desde GAME. Primero lo previsualizas; al confirmar se genera un JSON en el worker y pasa por el mismo flujo de precios/revisión.
            </p>
          </div>
          <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800 dark:border-amber-400/30 dark:bg-amber-900/30 dark:text-amber-100">
            No toca la rueda Ionos
          </span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-muted">
              Plataforma destino
              <select value={platformSlug} onChange={(event) => setPlatformSlug(event.target.value as "ps4" | "ps5")} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                <option value="ps4">PS4</option>
                <option value="ps5">PS5</option>
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">
              Tipo de precio
              <select value={offerType} onChange={(event) => setOfferType(event.target.value as LocalGameRunnerOfferType)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground">
                <option value="preowned">Seminuevo GAME</option>
                <option value="new">Nuevo GAME</option>
              </select>
            </label>
            <div className="rounded-2xl border border-border bg-background/55 p-3 text-xs leading-5 text-muted">
              Recomendado ahora: <strong className="text-foreground">PS4 · Seminuevo</strong>. Lo seguro puede autoaceptarse; lo dudoso va a revisión.
            </div>
          </div>
          <label className="block text-xs font-semibold text-muted">
            Texto copiado de GAME
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              rows={10}
              placeholder={"EA Sports FC 25 - Seminuevo\\nEA Sports FC 25 - Seminuevo\\n\\nComprar\\n24 '99 €"}
              className="mt-1 w-full rounded-2xl border border-border bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={previewPaste} disabled={pasteState === "previewing" || pasteState === "importing"} className="btn-secondary text-sm">
            {pasteState === "previewing" ? "Previsualizando..." : "Previsualizar"}
          </button>
          <button
            type="button"
            onClick={importPaste}
            disabled={pasteState === "importing" || !pastePreview || pastePreview.stats.parsedProducts <= 0}
            className="btn-primary text-sm"
          >
            {pasteState === "importing" ? "Importando..." : "Confirmar e importar"}
          </button>
        </div>
        {pasteMessage ? (
          <p className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${pasteState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {pasteMessage}
          </p>
        ) : null}
        {pastePreview ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-background/55 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Productos</p>
              <p className="mt-1 text-2xl font-black text-foreground">{pastePreview.stats.parsedProducts}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/55 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Descartes obvios</p>
              <p className="mt-1 text-2xl font-black text-foreground">{pastePreview.stats.skippedLikelyNonGames}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/55 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Duplicados</p>
              <p className="mt-1 text-2xl font-black text-foreground">{pastePreview.stats.duplicateSkipped}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/55 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Líneas sueltas</p>
              <p className="mt-1 text-2xl font-black text-foreground">{pastePreview.stats.unmatchedLines + pastePreview.stats.strayPrices}</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/55 p-3 lg:col-span-2">
              <p className="text-xs font-bold text-foreground">Primeros productos detectados</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {pastePreview.products.slice(0, 8).map((product) => (
                  <li key={`${product.title}-${product.priceEur}`}>• {product.title} — {product.priceEur.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-background/55 p-3 lg:col-span-2">
              <p className="text-xs font-bold text-foreground">Descartes revisables</p>
              {pastePreview.skipped.length ? (
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {pastePreview.skipped.slice(0, 8).map((product) => (
                    <li key={`${product.title}-${product.priceEur}`}>• {product.title} — {product.reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted">No he visto accesorios/merchandising obvio.</p>
              )}
            </div>
          </div>
        ) : null}
        {pasteLog ? (
          <details className="mt-4 rounded-xl border border-emerald-400/25 bg-slate-950 p-3">
            <summary className="cursor-pointer list-none text-xs font-semibold text-emerald-200">Log de importación del pegado</summary>
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-400/15 bg-black/70 p-3 font-mono text-[11px] leading-5 text-emerald-100">{pasteLog}</pre>
          </details>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {jobs.length ? jobs.map((job) => (
          <article key={job.id} className="rounded-2xl border border-border bg-background/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-foreground">{job.platformSlug.toUpperCase()} · {job.offerType === "preowned" ? "Seminuevo" : "Nuevo"}</p>
                <p className="mt-1 text-xs text-muted">Creado: {formatDate(job.createdAt)} · Actualizado: {formatDate(job.updatedAt)}</p>
                <p className="text-xs text-muted">
                  Límite {job.limit} · desde página {(job.startPage ?? 0) + 1} · páginas {job.maxPages ?? 1} · evita {job.skipRecentDays ?? 0} días
                </p>
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
            {job.status === "done" && job.resultPath ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => importJob(job.id)}
                  disabled={importingJobId === job.id}
                  className="btn-secondary text-xs"
                >
                  {importingJobId === job.id
                    ? "Importando..."
                    : job.importStatus === "imported"
                      ? "Reimportar resultado"
                      : "Importar al flujo"}
                </button>
                <span className="text-xs text-muted">
                  {job.importStatus === "imported"
                    ? `Importado: ${formatDate(job.importedAt)}`
                    : job.importStatus === "error"
                      ? "Importación con error"
                      : "No importado todavía"}
                </span>
              </div>
            ) : null}
            {job.importError ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">Importación: {job.importError}</p> : null}
            {job.importLogTail ? (
              <details className="mt-3 rounded-xl border border-emerald-400/25 bg-slate-950 p-3">
                <summary className="cursor-pointer list-none text-xs font-semibold text-emerald-200">Log de importación</summary>
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-400/15 bg-black/70 p-3 font-mono text-[11px] leading-5 text-emerald-100">{job.importLogTail}</pre>
              </details>
            ) : null}
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

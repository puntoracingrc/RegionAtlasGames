"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import type { AdminGameDraft } from "@/lib/admin-draft-types";
import { recomputeCatalogId } from "@/lib/admin-draft-patch";
import type { AdminGameEditorTaxonomyOption } from "@/lib/admin-game-editor-options";
import type { CatalogStagingGame } from "@/lib/catalog-staging-types";
import { getCoverSrc } from "@/lib/cover-url";
import { getPhysicalVariant, PHYSICAL_VARIANTS } from "@/lib/physical-variants";
import { buildCatalogSeoSlug } from "@/lib/catalog-path";

export type CompanyOption = { name: string; slug: string };
type ReviewNavItem = { pcId: number; title: string };
type ReviewNav = {
  previous: ReviewNavItem | null;
  next: ReviewNavItem | null;
  position: number;
  total: number;
};

type Props = {
  pcId: number;
  initialDraft: AdminGameDraft;
  staging?: CatalogStagingGame | null;
  companies: CompanyOption[];
  taxonomyOptions: {
    genres: AdminGameEditorTaxonomyOption[];
    subgenres: AdminGameEditorTaxonomyOption[];
    facets: AdminGameEditorTaxonomyOption[];
  };
  autoAi?: boolean;
  mode?: "staging" | "published" | "contributor";
  catalogId?: string;
  readOnly?: boolean;
  reviewNav?: ReviewNav;
};

type LogLine = { id: number; text: string; tone?: "ok" | "err" };
type AiTarget = "cover" | "companies" | "taxonomy" | "release" | "players" | "support" | "description" | "seo";
type PriceJobState = {
  jobId: string;
  status: "running" | "done" | "error";
  logTail?: string;
  error?: string;
};
type PublishJobState = {
  jobId: string;
  status: "running" | "done" | "error";
  url?: string;
  error?: string;
};

const PRICE_SOURCE_LABELS = [
  "eBay",
  "Wallapop",
  "Vinted",
  "TodoColeccion",
  "TodoConsolas",
  "JGO",
  "Kaoto",
  "CeX",
  "Chollo",
] as const;

function priceLogLines(logTail?: string): string[] {
  return (logTail ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-60);
}

function priceLogSourceStatus(logTail?: string): { source: string; status: string; tone: "idle" | "active" | "done" }[] {
  const lines = priceLogLines(logTail);
  return PRICE_SOURCE_LABELS.map((source) => {
    const sourceLines = lines.filter((line) => line.toLowerCase().includes(source.toLowerCase()));
    const latest = sourceLines.at(-1);
    if (!latest) return { source, status: "pendiente", tone: "idle" as const };
    if (/guardado|actualizado|rechazado|referencias|listings|búsquedas|busquedas/i.test(latest)) {
      return { source, status: latest.replace(/^[-=\s]+|[-=\s]+$/g, ""), tone: "done" as const };
    }
    return { source, status: latest.replace(/^[-=\s]+|[-=\s]+$/g, ""), tone: "active" as const };
  }).filter((item) => item.tone !== "idle");
}

function priceLogCurrentStep(logTail?: string): string {
  const lines = priceLogLines(logTail);
  return (
    [...lines]
      .reverse()
      .find((line) =>
        /collector|plataforma|merge|sync|buscando|búsqueda|busqueda|\[\d+\/\d+\]|resultados|referencias|listings/i.test(line),
      ) ?? "Preparando collectors de precios…"
  );
}

function PriceCollectionLivePanel({ job }: { job: PriceJobState }) {
  const sources = priceLogSourceStatus(job.logTail);
  const currentStep = priceLogCurrentStep(job.logTail);
  const lines = priceLogLines(job.logTail);
  const statusLabel =
    job.status === "running"
      ? "Recolectando en directo"
      : job.status === "done"
        ? "Recolección terminada"
        : "Recolección con error";

  return (
    <div className="mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-200">
            {statusLabel}
          </p>
          <p className="mt-1 font-semibold text-foreground">{currentStep}</p>
          <p className="mt-1 text-xs text-muted">
            Job {job.jobId} · se refresca automáticamente cada pocos segundos.
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            job.status === "running"
              ? "border-emerald-400/40 text-emerald-800 dark:text-emerald-200"
              : job.status === "done"
                ? "border-sky-400/40 text-sky-800 dark:text-sky-200"
                : "border-rose-400/40 text-rose-800 dark:text-rose-200"
          }`}
        >
          {job.status}
        </span>
      </div>

      {sources.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => (
            <div
              key={source.source}
              className="rounded-xl border border-border bg-background/70 p-3"
            >
              <p className="font-semibold text-foreground">{source.source}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{source.status}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-border bg-background/70 p-3 text-xs text-muted">
          Esperando primeras líneas del worker: aparecerán Wallapop, Vinted, CeX, TodoColeccion y el resto de collectors cuando arranquen.
        </p>
      )}

      {lines.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-accent">
            Ver detalle técnico de la recolección
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-border bg-background/80 p-3 text-[11px] leading-relaxed text-muted">
            {lines.slice(-45).join("\n")}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function EntityCombo({
  label,
  name,
  slug,
  options,
  onChange,
  action,
}: {
  label: string;
  name: string;
  slug: string;
  options: CompanyOption[];
  onChange: (name: string, slug: string) => void;
  action?: ReactNode;
}) {
  const listId = `${label.replace(/\s+/g, "-").toLowerCase()}-list`;

  return (
    <label className="block space-y-1">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
        {action}
      </span>
      <input
        list={listId}
        className="input"
        value={name}
        onChange={(e) => {
          const nextName = e.target.value;
          const match = options.find(
            (o) => o.name.toLowerCase() === nextName.toLowerCase(),
          );
          onChange(nextName, match?.slug ?? slug);
        }}
        placeholder="Elegir existente o escribir nueva"
      />
      <datalist id={listId}>
        {options.slice(0, 300).map((o) => (
          <option key={o.slug} value={o.name} />
        ))}
      </datalist>
    </label>
  );
}

function normalizeSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function uniqueNames(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true }),
  );
}

export function ControlledTaxonomySelector({
  label,
  helper,
  selected,
  options,
  onChange,
  disabled = false,
  action,
}: {
  label: string;
  helper: string;
  selected: string[];
  options: AdminGameEditorTaxonomyOption[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  action?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const selectedNames = uniqueNames(selected);
  const selectedSet = new Set(selectedNames);
  const validNameSet = new Set(options.map((option) => option.name));
  const legacySelected = selectedNames.filter((name) => !validNameSet.has(name));
  const visibleOptions = options
    .filter((option) => {
      const needle = normalizeSearch(query);
      if (!needle) return true;
      return normalizeSearch(`${option.name} ${option.family ?? ""} ${option.slug}`).includes(needle);
    })
    .slice(0, 80);

  function toggle(name: string) {
    if (disabled) return;
    if (selectedSet.has(name)) {
      onChange(selectedNames.filter((item) => item !== name));
      return;
    }
    onChange(uniqueNames([...selectedNames, name]));
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-background/45 p-3 sm:col-span-2">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
          {action}
        </div>
        <p className="mt-1 text-xs text-muted">{helper}</p>
      </div>
      <input
        className="input"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Busca y marca opciones existentes…"
      />
      {selectedNames.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedNames.map((name) => (
            <button
              key={name}
              type="button"
              disabled={disabled}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                validNameSet.has(name)
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-amber-400/50 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              }`}
              onClick={() => toggle(name)}
              title={validNameSet.has(name) ? "Quitar" : "Valor antiguo fuera del listado controlado; pulsa para quitarlo"}
            >
              {name} ×
            </button>
          ))}
        </div>
      ) : null}
      {legacySelected.length ? (
        <p className="rounded-xl border border-amber-300/60 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
          Hay valores antiguos fuera del listado controlado. Puedes quitarlos, pero para añadir nuevos usa solo las opciones marcables.
        </p>
      ) : null}
      <div className="grid max-h-60 gap-2 overflow-auto pr-1">
        {visibleOptions.map((option) => {
          const checked = selectedSet.has(option.name);
          return (
            <label
              key={option.slug}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                checked
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border bg-card/50 text-muted hover:border-accent/50 hover:text-foreground"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{option.name}</span>
                {option.family ? <span className="text-[10px] uppercase tracking-wider text-muted">{option.family}</span> : null}
              </span>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(option.name)}
              />
            </label>
          );
        })}
        {visibleOptions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted">
            No hay opciones válidas con ese filtro.
          </p>
        ) : null}
      </div>
      {options.length > visibleOptions.length ? (
        <p className="text-xs text-muted">Mostrando {visibleOptions.length} de {options.length}; escribe para afinar.</p>
      ) : null}
    </div>
  );
}

function AiMagicButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-full border border-violet-300/60 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-800 transition hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-45 dark:text-violet-200"
      disabled={disabled || busy}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      title={label}
    >
      {busy ? "✦…" : "✦ IA"}
    </button>
  );
}

export function AdminGameEditor({
  pcId,
  initialDraft,
  staging,
  companies,
  taxonomyOptions,
  autoAi = false,
  mode = "staging",
  catalogId: catalogIdProp,
  readOnly = false,
  reviewNav,
}: Props) {
  const isPublished = mode === "published";
  const isContributor = mode === "contributor";
  const locked = readOnly || (isContributor && staging?.reviewStatus === "pending-review");
  const catalogId = catalogIdProp ?? initialDraft.catalogId;
  const [draft, setDraft] = useState<AdminGameDraft>({
    ...initialDraft,
    subgenreNames: initialDraft.subgenreNames ?? [],
    facetNames: initialDraft.facetNames ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiTargetRunning, setAiTargetRunning] = useState<string | null>(null);
  const [priceCollecting, setPriceCollecting] = useState(false);
  const [priceJob, setPriceJob] = useState<PriceJobState | null>(null);
  const [publishJob, setPublishJob] = useState<PublishJobState | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiManualUrl, setAiManualUrl] = useState("");
  const [aiExtraInstructions, setAiExtraInstructions] = useState("");
  const logId = useRef(0);
  const pricePollRef = useRef<number | null>(null);
  const publishPollRef = useRef<number | null>(null);
  const autoAiStarted = useRef(false);
  const selectedGenreSlugs = useMemo(() => {
    const selectedGenreNames = new Set(draft.genreNames.map((name) => normalizeSearch(name)));
    return taxonomyOptions.genres
      .filter((option) => selectedGenreNames.has(normalizeSearch(option.name)))
      .map((option) => option.slug);
  }, [draft.genreNames, taxonomyOptions.genres]);
  const subgenreOptions = useMemo(() => {
    if (selectedGenreSlugs.length === 0) return taxonomyOptions.subgenres;
    const selectedGenreSlugSet = new Set(selectedGenreSlugs);
    const related = taxonomyOptions.subgenres.filter((option) =>
      option.parentGenreSlugs?.some((slug) => selectedGenreSlugSet.has(slug)),
    );
    const relatedSlugs = new Set(related.map((option) => option.slug));
    return [...related, ...taxonomyOptions.subgenres.filter((option) => !relatedSlugs.has(option.slug))];
  }, [selectedGenreSlugs, taxonomyOptions.subgenres]);

  const pushLog = useCallback((text: string, tone?: LogLine["tone"]) => {
    logId.current += 1;
    setLogs((prev) => [...prev.slice(-40), { id: logId.current, text, tone }]);
  }, []);

  const patchDraft = useCallback((patch: Partial<AdminGameDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  async function saveDraft(next?: Partial<AdminGameDraft>) {
    setSaving(true);
    setError(null);
    setMessage(null);
    const payload = { ...draft, ...next };
    try {
      const url = isPublished
        ? `/api/admin/catalog/${encodeURIComponent(catalogId)}`
        : isContributor
          ? `/api/contribuir/staging/${pcId}`
          : `/api/admin/staging/${pcId}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        return false;
      }
      setDraft(data.draft);
      setMessage(
        isPublished
          ? "Ficha publicada actualizada."
          : isContributor
            ? "Borrador guardado."
            : "Borrador guardado.",
      );
      if (isPublished && data.redirect) {
        window.location.href = data.redirect;
      }
      return true;
    } catch {
      setError("Error de red al guardar.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function runAiFill(targets?: AiTarget[], label = "relleno con IA") {
    setAiRunning(true);
    setAiTargetRunning(targets?.join("+") ?? "all");
    setError(null);
    setMessage(null);
    setLogs([]);
    pushLog(targets?.length ? `Iniciando IA para ${label}…` : "Iniciando relleno con IA…");

    await saveDraft();

    try {
      const aiUrl = isPublished
        ? `/api/admin/catalog/${encodeURIComponent(catalogId)}/ai-fill`
        : `/api/admin/staging/${pcId}/ai-fill`;
      const res = await fetch(aiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualUrl: aiManualUrl,
          extraInstructions: aiExtraInstructions,
          targets,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo iniciar la IA.");
        setAiRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as {
              type: string;
              message?: string;
              field?: string;
              value?: unknown;
              draft?: AdminGameDraft;
            };
            if (event.type === "log" && event.message) {
              pushLog(event.message);
            } else if (event.type === "field" && event.field) {
              if (event.field === "genres") {
                patchDraft({ genreNames: event.value as string[] });
                pushLog(`Géneros: ${(event.value as string[]).join(", ")}`, "ok");
              } else {
                patchDraft({ [event.field]: event.value } as Partial<AdminGameDraft>);
                pushLog(`Campo actualizado: ${event.field}`, "ok");
              }
            } else if (event.type === "error" && event.message) {
              pushLog(event.message, "err");
              setError(event.message);
            } else if (event.type === "done" && event.draft) {
              setDraft(event.draft);
              pushLog(targets?.length ? `IA terminada para ${label}.` : "IA terminada. Revisa y publica.", "ok");
              setMessage(targets?.length ? `IA aplicada a ${label}.` : "Datos rellenados con IA.");
            }
          } catch {
            /* ignore malformed chunks */
          }
        }
      }
    } catch {
      setError("Conexión interrumpida con la IA.");
    } finally {
      setAiRunning(false);
      setAiTargetRunning(null);
    }
  }

  const refreshPriceJob = useCallback(async (jobId: string): Promise<PriceJobState | null> => {
    try {
      const res = await fetch(`/api/admin/price-jobs/${encodeURIComponent(jobId)}`);
      const data = await res.json();
      if (!res.ok) return null;
      const job = data.job as PriceJobState;
      setPriceJob(job);
      if (job.status === "done") {
        setPriceCollecting(false);
        setMessage("Recolección de precios terminada. Revisa el panel de precios.");
      } else if (job.status === "error") {
        setPriceCollecting(false);
        setError(job.error ?? "La recolección de precios falló.");
      }
      return job;
    } catch {
      return null;
    }
  }, []);

  function pollPriceJob(jobId: string) {
    if (pricePollRef.current != null) window.clearInterval(pricePollRef.current);
    void refreshPriceJob(jobId);
    pricePollRef.current = window.setInterval(async () => {
      const job = await refreshPriceJob(jobId);
      if (job?.status === "done" || job?.status === "error") {
        if (pricePollRef.current != null) window.clearInterval(pricePollRef.current);
      }
    }, 3000);
  }

  function pollPublishJob(jobId: string) {
    if (publishPollRef.current != null) window.clearInterval(publishPollRef.current);
    publishPollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/publish-jobs/${encodeURIComponent(jobId)}`);
        const data = await res.json();
        if (!res.ok) return;
        const job = data.job as PublishJobState;
        setPublishJob(job);
        if (job.status === "done") {
          setMessage("Publicado. Ya puedes seguir revisando fichas.");
          if (publishPollRef.current != null) window.clearInterval(publishPollRef.current);
        } else if (job.status === "error") {
          setError(job.error ?? "La publicación falló.");
          if (publishPollRef.current != null) window.clearInterval(publishPollRef.current);
        }
      } catch {
        /* ignore transient polling errors */
      }
    }, 2500);
  }

  async function collectGamePrices() {
    if (!isPublished) return;
    setPriceCollecting(true);
    setPriceJob(null);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/catalog/${encodeURIComponent(catalogId)}/collect-prices`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar la recolección de precios.");
        setPriceCollecting(false);
        return;
      }
      setPriceJob({ jobId: data.jobId, status: "running" });
      setMessage("Recolección de precios en curso para este juego…");
      pollPriceJob(data.jobId);
    } catch {
      setError("Error de red al iniciar la recolección de precios.");
      setPriceCollecting(false);
    }
  }

  async function uploadCoverFile(file: File) {
    setCoverUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const url = isPublished
        ? `/api/admin/catalog/${encodeURIComponent(catalogId)}/cover`
        : isContributor
          ? `/api/contribuir/staging/${pcId}/cover`
          : `/api/admin/staging/${pcId}/cover`;
      const res = await fetch(url, {
        method: "POST",
        body: form,
      });
      const text = await res.text();
      let data: { error?: string; coverUrl?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: text.slice(0, 500) || "Respuesta no válida del servidor." };
      }
      if (!res.ok) {
        setError(data.error ?? "No se pudo subir la portada.");
        return;
      }
      if (!data.coverUrl) {
        setError("La portada se subió, pero el servidor no devolvió la URL.");
        return;
      }
      patchDraft({ coverUrl: data.coverUrl });
      setMessage(`Portada subida: ${data.coverUrl}`);
    } catch (error) {
      setError(error instanceof Error ? `Error al subir la portada: ${error.message}` : "Error al subir la portada.");
    } finally {
      setCoverUploading(false);
    }
  }

  async function enrichCover() {
    setEnriching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/staging/${pcId}/enrich`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Enriquecimiento fallido.");
        return;
      }
      if (data.game?.coverUrl) {
        patchDraft({ coverUrl: data.game.coverUrl });
        setMessage("Portada obtenida de PriceCharting.");
      } else {
        setMessage("Enriquecimiento completado (sin portada nueva).");
      }
    } catch {
      setError("Error al enriquecer portada.");
    } finally {
      setEnriching(false);
    }
  }

  async function publish() {
    if (!confirm("¿Publicar este juego en el catálogo maestro?")) return;
    setPublishing(true);
    setError(null);
    setMessage(null);
    setPublishJob(null);
    const saved = await saveDraft();
    if (!saved) {
      setPublishing(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/staging/${pcId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ background: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo publicar.");
        return;
      }
      if (data.queued && data.job) {
        const job = data.job as PublishJobState;
        setPublishJob(job);
        setMessage("Publicación lanzada en segundo plano. Puedes abrir otro juego.");
        pollPublishJob(job.jobId);
        return;
      }
      setMessage(
        data.mode === "overlay"
          ? "Publicado en caliente (visible al instante en la web)."
          : data.mode === "both"
            ? "Publicado en caliente y guardado en catalog.json local."
            : "Publicado en catalog.json local.",
      );
      if (data.deployHook?.triggered) {
        setMessage((prev) => `${prev ?? ""} Deploy de Vercel disparado.`.trim());
      }
    } catch {
      setError("Error al publicar.");
    } finally {
      setPublishing(false);
    }
  }

  async function submitForReview() {
    if (
      !confirm(
        "¿Enviar esta ficha a revisión del administrador? Después no podrás editarla hasta que la revisen.",
      )
    ) {
      return;
    }

    setPublishing(true);
    setError(null);
    setMessage(null);
    const saved = await saveDraft();
    if (!saved) {
      setPublishing(false);
      return;
    }

    try {
      const res = await fetch(`/api/contribuir/staging/${pcId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar a revisión.");
        return;
      }
      setMessage(data.message ?? "Enviada a revisión.");
      window.location.href = data.redirect ?? "/contribuir";
    } catch {
      setError("Error de red al enviar.");
    } finally {
      setPublishing(false);
    }
  }

  async function deleteGame() {
    const publishedHint = isPublished
      ? "\n\nSe eliminará del catálogo publicado."
      : staging?.status === "promoted"
        ? "\n\nTambién se eliminará del catálogo publicado."
        : draft.catalogId
          ? "\n\nSi ya estaba publicado, también se quitará del catálogo."
          : "";
    if (
      !confirm(
        `¿Eliminar la ficha «${draft.title}»? Esta acción no se puede deshacer.${publishedHint}`,
      )
    ) {
      return;
    }

    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const url = isPublished
        ? `/api/admin/catalog/${encodeURIComponent(catalogId)}`
        : `/api/admin/staging/${pcId}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo eliminar la ficha.");
        return;
      }
      window.location.replace(data.redirect ?? (isPublished ? "/admin/juegos" : "/admin/cola"));
    } catch {
      setError("Error al eliminar la ficha.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (autoAi && !autoAiStarted.current && !isPublished && !isContributor) {
      autoAiStarted.current = true;
      void runAiFill();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAi]);

  useEffect(() => {
    return () => {
      if (pricePollRef.current != null) window.clearInterval(pricePollRef.current);
      if (publishPollRef.current != null) window.clearInterval(publishPollRef.current);
    };
  }, []);

  const coverTargetId = recomputeCatalogId(draft);
  const coverTargetPath = `/covers/${draft.platformSlug}/${coverTargetId}.jpg`;
  const selectedPhysicalVariant = getPhysicalVariant(draft.physicalVariant);
  const publicPreviewSlug = buildCatalogSeoSlug(draft);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Panel className={adminToneClass("edit")}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <PanelTitle eyebrow={isContributor ? "Edición colaborador" : "Editor"}>Ficha de catálogo</PanelTitle>
              <p className="text-sm text-muted">
                {isContributor
                  ? locked
                    ? "En revisión por el administrador"
                    : "Borrador de colaborador"
                  : isPublished
                    ? "Ficha publicada en catálogo"
                    : staging && staging.importCount > 0
                      ? `${staging.userCount} usuarios · ${staging.unitCount} unidades importadas`
                      : staging && staging.pcId < 0
                        ? "Entrada manual"
                        : staging
                          ? "Revisión de importación"
                          : "Borrador"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {staging && (
                <Badge tone={staging.status === "enriched" ? "green" : "amber"}>
                  {isPublished ? "publicado" : staging.status}
                </Badge>
              )}
              {isContributor && staging?.reviewStatus === "pending-review" && (
                <Badge tone="amber">pendiente revisión</Badge>
              )}
              {isContributor && staging?.reviewStatus === "contributor-draft" && (
                <Badge tone="neutral">borrador</Badge>
              )}
              {isPublished && <Badge tone="green">catálogo</Badge>}
              {!isPublished && staging && staging.pcId > 0 && (
                <Badge tone="neutral">PC #{staging.pcId}</Badge>
              )}
            </div>
          </div>

          {reviewNav && (
            <div className="mb-5 grid gap-2 rounded-2xl border border-border bg-background/60 p-3 text-sm md:grid-cols-[1fr_auto_1fr] md:items-center">
              {reviewNav.previous ? (
                <Link
                  href={`/admin/cola/${reviewNav.previous.pcId}`}
                  className="rounded-xl border border-border px-3 py-2 font-semibold text-foreground transition hover:bg-card-hover"
                >
                  ← Anterior
                  <span className="mt-1 block truncate text-xs font-normal text-muted">
                    {reviewNav.previous.title}
                  </span>
                </Link>
              ) : (
                <span className="rounded-xl border border-border px-3 py-2 text-muted opacity-60">
                  ← Anterior
                </span>
              )}
              <span className="text-center text-xs font-semibold uppercase tracking-wider text-muted">
                {reviewNav.position} / {reviewNav.total}
              </span>
              {reviewNav.next ? (
                <Link
                  href={`/admin/cola/${reviewNav.next.pcId}`}
                  className="rounded-xl border border-border px-3 py-2 text-right font-semibold text-foreground transition hover:bg-card-hover"
                >
                  Siguiente →
                  <span className="mt-1 block truncate text-xs font-normal text-muted">
                    {reviewNav.next.title}
                  </span>
                </Link>
              ) : (
                <span className="rounded-xl border border-border px-3 py-2 text-right text-muted opacity-60">
                  Siguiente →
                </span>
              )}
            </div>
          )}

          <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2 disabled:opacity-70">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">Título</span>
              <input
                className="input"
                value={draft.title}
                onChange={(e) => patchDraft({ title: e.target.value })}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Slug URL</span>
              <input
                className="input font-mono text-xs"
                value={draft.slug}
                onChange={(e) => {
                  const slug = e.target.value;
                  patchDraft({
                    slug,
                    catalogId: recomputeCatalogId({
                      platformSlug: draft.platformSlug,
                      slug,
                      region: draft.region,
                    }),
                  });
                }}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">ID catálogo</span>
              <input
                className="input font-mono text-xs"
                value={draft.catalogId}
                readOnly
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Plataforma</span>
              <input
                className="input"
                value={draft.platformSlug}
                readOnly
              />
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">Región</span>
              <select
                className="input"
                value={draft.region}
                onChange={(e) =>
                  patchDraft({
                    region: e.target.value,
                    catalogId: recomputeCatalogId({
                      platformSlug: draft.platformSlug,
                      slug: draft.slug,
                      region: e.target.value,
                    }),
                  })
                }
              >
                <option value="PAL España">PAL España</option>
                <option value="PAL Europa">PAL Europa</option>
                <option value="USA">USA</option>
                <option value="Japón">Japón</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Variante física / portada
              </span>
              <select
                className="input"
                value={draft.physicalVariant ?? ""}
                onChange={(e) => patchDraft({ physicalVariant: e.target.value || null })}
              >
                <option value="">Sin clasificar</option>
                {PHYSICAL_VARIANTS.map((variant) => (
                  <option key={variant.slug} value={variant.slug}>
                    {variant.label}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-muted">
                {selectedPhysicalVariant
                  ? selectedPhysicalVariant.description
                  : "Clave para no mezclar precios de portadas españolas, UK, USK, ESRB, CERO, etc."}
              </p>
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  Referencia (SKU / CUSA / código)
                </span>
                <AiMagicButton
                  label="Buscar referencia y fecha con IA"
                  busy={aiTargetRunning === "release"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["release"], "referencia y fecha")}
                />
              </span>
              <input
                className="input font-mono"
                value={draft.reference ?? ""}
                onChange={(e) => patchDraft({ reference: e.target.value || null })}
                placeholder="ej. CUSA-12345, SLES-12345…"
              />
            </label>

            <label className="block space-y-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">Año</span>
                <AiMagicButton
                  label="Buscar año con IA"
                  busy={aiTargetRunning === "release"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["release"], "año")}
                />
              </span>
              <input
                type="number"
                className="input"
                value={draft.year ?? ""}
                onChange={(e) =>
                  patchDraft({
                    year: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  })
                }
              />
            </label>

            <label className="block space-y-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">Jugadores</span>
                <AiMagicButton
                  label="Buscar jugadores con IA"
                  busy={aiTargetRunning === "players"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["players"], "jugadores")}
                />
              </span>
              <input
                type="number"
                className="input"
                value={draft.players ?? ""}
                onChange={(e) =>
                  patchDraft({
                    players: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  })
                }
              />
            </label>

            <label className="block space-y-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">Soporte</span>
                <AiMagicButton
                  label="Buscar soporte con IA"
                  busy={aiTargetRunning === "support"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["support"], "soporte")}
                />
              </span>
              <input
                className="input"
                value={draft.support ?? ""}
                onChange={(e) => patchDraft({ support: e.target.value || null })}
                placeholder="PS5, PS4, PS VR2, mando, online…"
              />
            </label>

            <EntityCombo
              label="Desarrolladora"
              name={draft.developerName ?? ""}
              slug={draft.developerSlug ?? ""}
              options={companies}
              onChange={(name, slug) => patchDraft({ developerName: name, developerSlug: slug })}
              action={
                <AiMagicButton
                  label="Buscar desarrolladora y editora con IA"
                  busy={aiTargetRunning === "companies"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["companies"], "compañías")}
                />
              }
            />

            <EntityCombo
              label="Editora"
              name={draft.publisherName ?? ""}
              slug={draft.publisherSlug ?? ""}
              options={companies}
              onChange={(name, slug) => patchDraft({ publisherName: name, publisherSlug: slug })}
              action={
                <AiMagicButton
                  label="Buscar desarrolladora y editora con IA"
                  busy={aiTargetRunning === "companies"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["companies"], "compañías")}
                />
              }
            />

            <ControlledTaxonomySelector
              label="Géneros"
              helper="Busca y marca géneros del listado controlado; no admite texto libre nuevo."
              selected={draft.genreNames}
              options={taxonomyOptions.genres}
              disabled={locked}
              onChange={(genreNames) => patchDraft({ genreNames })}
              action={
                <AiMagicButton
                  label="Buscar taxonomía con IA"
                  busy={aiTargetRunning === "taxonomy"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["taxonomy"], "géneros, subgéneros y facetas")}
                />
              }
            />

            <ControlledTaxonomySelector
              label="Subgéneros controlados"
              helper="Al elegir género, los subgéneros relacionados aparecen primero."
              selected={draft.subgenreNames}
              options={subgenreOptions}
              disabled={locked}
              onChange={(subgenreNames) => patchDraft({ subgenreNames })}
              action={
                <AiMagicButton
                  label="Buscar taxonomía con IA"
                  busy={aiTargetRunning === "taxonomy"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["taxonomy"], "géneros, subgéneros y facetas")}
                />
              }
            />

            <ControlledTaxonomySelector
              label="Facetas / etiquetas controladas"
              helper="Mecánicas, formato, tema, edición, modo de juego y otras facetas aprobadas."
              selected={draft.facetNames}
              options={taxonomyOptions.facets}
              disabled={locked}
              onChange={(facetNames) => patchDraft({ facetNames })}
              action={
                <AiMagicButton
                  label="Buscar taxonomía con IA"
                  busy={aiTargetRunning === "taxonomy"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["taxonomy"], "géneros, subgéneros y facetas")}
                />
              }
            />

            <label className="block space-y-1 sm:col-span-2">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">URL portada</span>
                <AiMagicButton
                  label="Buscar solo portada con IA"
                  busy={aiTargetRunning === "cover"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["cover"], "portada")}
                />
              </span>
              <input
                className="input"
                value={draft.coverUrl ?? ""}
                onChange={(e) => patchDraft({ coverUrl: e.target.value || null })}
                placeholder={coverTargetPath}
              />
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">
                Subir portada al CDN
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent-fg"
                disabled={coverUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadCoverFile(file);
                  e.target.value = "";
                }}
              />
              <p className="text-xs text-muted">
                Se sube a{" "}
                <code className="text-[11px]">
                  {coverTargetPath}
                </code>{" "}
                vía SFTP (COVERS_FTP_*).
              </p>
            </label>

            <label className="block space-y-1 sm:col-span-2">
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted">Descripción</span>
                <AiMagicButton
                  label="Generar solo descripción con IA"
                  busy={aiTargetRunning === "description"}
                  disabled={saving || aiRunning || locked || isContributor}
                  onClick={() => void runAiFill(["description"], "descripción")}
                />
              </span>
              <textarea
                rows={6}
                className="input leading-relaxed"
                value={draft.description ?? ""}
                onChange={(e) => patchDraft({ description: e.target.value || null })}
              />
            </label>
          </fieldset>

          <div className="mt-6 flex flex-wrap gap-2">
            {!locked && (
              <button
                type="button"
                className="btn-primary"
                disabled={saving || aiRunning}
                onClick={() => void saveDraft()}
              >
                {saving
                  ? "Guardando…"
                  : isPublished
                    ? "Guardar cambios"
                    : "Guardar borrador"}
              </button>
            )}
            {isContributor && !locked && (
              <button
                type="button"
                className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-500/15 dark:text-emerald-200 disabled:opacity-50"
                disabled={publishing || saving}
                onClick={() => void submitForReview()}
              >
                {publishing ? "Enviando…" : "Enviar a revisión"}
              </button>
            )}
            {isPublished && (
              <button
                type="button"
                className="rounded-xl border border-amber-400/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-200 disabled:opacity-50"
                disabled={priceCollecting}
                onClick={() => void collectGamePrices()}
              >
                {priceCollecting ? "Recolectando precios…" : "Recolectar precios de este juego"}
              </button>
            )}
            {!isContributor && !locked && (
              <button
                type="button"
                className="rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-800 transition hover:bg-violet-500/15 dark:text-violet-200 disabled:opacity-50"
                disabled={aiRunning || saving}
                onClick={() => void runAiFill()}
              >
                {aiRunning ? "IA trabajando…" : "Rellenar con IA"}
              </button>
            )}
            {!isPublished && !isContributor && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={enriching || aiRunning}
                  onClick={() => void enrichCover()}
                >
                  {enriching ? "Buscando portada…" : "Portada (PriceCharting)"}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-500/15 dark:text-emerald-200 disabled:opacity-50"
                  disabled={publishing || aiRunning}
                  onClick={() => void publish()}
                >
                  {publishing ? "Lanzando…" : "Publicar en segundo plano"}
                </button>
              </>
            )}
            {!isContributor && (
              <button
                type="button"
                className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-500/15 dark:text-rose-200 disabled:opacity-50"
                disabled={deleting || publishing || aiRunning}
                onClick={() => void deleteGame()}
              >
                {deleting ? "Eliminando…" : "Eliminar ficha"}
              </button>
            )}
          </div>

          {locked && isContributor && (
            <p className="mt-3 text-sm text-muted">
              Esta ficha está en revisión. El administrador la publicará o pedirá cambios.
            </p>
          )}

          {!isPublished && !isContributor && (
            <div className="mt-4 grid gap-3 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Opciones para la IA
              </p>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  URL fuente manual
                </span>
                <input
                  className="input"
                  value={aiManualUrl}
                  onChange={(e) => setAiManualUrl(e.target.value)}
                  placeholder="https://store.playstation.com/... o web oficial con mejor info"
                  disabled={aiRunning}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  Instrucciones extra
                </span>
                <textarea
                  className="input min-h-24"
                  value={aiExtraInstructions}
                  onChange={(e) => setAiExtraInstructions(e.target.value)}
                  placeholder="Ej.: prioriza datos de PS Store, no menciones precio, la edición es PAL Europa física..."
                  disabled={aiRunning}
                />
              </label>
              <p className="text-xs text-muted">
                Si indicas una URL, la IA la consultará primero y la mostrará en Actividad IA.
              </p>
            </div>
          )}

          {message && <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
          {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          {publishJob && (
            <div className="mt-3 rounded-xl border border-border bg-background/70 p-3 text-sm">
              <p className="font-semibold text-foreground">
                {publishJob.status === "running"
                  ? "Publicación en curso…"
                  : publishJob.status === "done"
                    ? "Publicación completada"
                    : "Publicación con error"}
              </p>
              {publishJob.status === "done" && publishJob.url && (
                <Link
                  href={publishJob.url}
                  className="mt-1 inline-block text-accent hover:underline"
                  target="_blank"
                >
                  Ver ficha publicada →
                </Link>
              )}
              {publishJob.status === "running" && reviewNav?.next && (
                <Link
                  href={`/admin/cola/${reviewNav.next.pcId}`}
                  className="mt-1 inline-block text-accent hover:underline"
                >
                  Seguir con el siguiente juego →
                </Link>
              )}
            </div>
          )}
          {priceJob && <PriceCollectionLivePanel job={priceJob} />}
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel className={adminToneClass("media")}>
          <PanelTitle>Vista previa</PanelTitle>
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[200px] overflow-hidden rounded-lg border border-border bg-card-hover">
            {draft.coverUrl ? (
              (() => {
                const src =
                  getCoverSrc(draft.coverUrl, draft.catalogId) ??
                  (draft.coverUrl.startsWith("http") ? draft.coverUrl : null);
                return src ? (
                  <Image
                    src={src}
                    alt={draft.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
                    Vista previa no disponible
                  </div>
                );
              })()
            ) : (
              <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
                Sin portada
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-sm font-medium">{draft.title}</p>
          <p className="text-center text-xs text-muted">
            {draft.platformSlug} · {draft.region}
          </p>
          {selectedPhysicalVariant && (
            <p className="mt-1 text-center text-xs font-medium text-accent">
              {selectedPhysicalVariant.label}
            </p>
          )}
          <Link
            href={`/catalogo/${publicPreviewSlug}`}
            className="mt-3 block text-center text-xs text-accent hover:underline"
            target="_blank"
          >
            Ver URL prevista →
          </Link>
        </Panel>

        {(aiRunning || logs.length > 0) && (
          <Panel className={adminToneClass("ai")}>
            <PanelTitle>Actividad IA</PanelTitle>
            <ul className="max-h-64 space-y-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
              {logs.map((line) => (
                <li
                  key={line.id}
                  className={
                    line.tone === "err"
                      ? "text-rose-600 dark:text-rose-400"
                      : line.tone === "ok"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted"
                  }
                >
                  {line.text}
                </li>
              ))}
              {aiRunning && (
                <li className="animate-pulse text-violet-600 dark:text-violet-300">…</li>
              )}
            </ul>
          </Panel>
        )}
      </aside>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type {
  PriceReviewCondition,
  PriceReviewItem,
  PriceReviewTriageCounts,
  PriceReviewTriageFilter,
} from "@/lib/admin-price-review";
import { Badge, Panel, PanelTitle } from "@/components/ui";
import { adminToneClass } from "./admin-visual";

type Props = {
  initialItems: PriceReviewItem[];
  initialCounts: PriceReviewTriageCounts;
  initialTotal: number;
};

type AutoRetroplayzoneCandidate = {
  id: string;
  listingTitle: string;
  catalogId: string | null;
  region: string | null;
  condition: PriceReviewCondition | null;
  priceEur: number;
  decision: "accept" | "skip";
  reason: string;
};

type AutoRetroplayzoneResponse = {
  ok?: boolean;
  mode?: "preview" | "apply";
  label?: string;
  totalPending?: number;
  totalRetroplayzonePending?: number;
  accepted?: number;
  skipped?: number;
  workerSynced?: boolean;
  workerSyncError?: string;
  candidates?: AutoRetroplayzoneCandidate[];
  error?: string;
};

const conditionLabels: Record<string, string> = {
  loose: "Suelto/cartucho/CD",
  game_manual: "Juego + manual",
  complete: "Completo",
  sealed: "Precintado",
  unknown: "Desconocido",
};

const commonRegionOptions = [
  "PAL España",
  "España",
  "PAL Europa",
  "PAL UK/ENG",
  "PAL Alemania",
  "USA",
  "Japón",
  "Asia",
  "Australia",
];

const sourceLabels: Record<string, string> = {
  "game-es-preowned": "GAME España · Seminuevo",
  "game-es-new": "GAME España · Nuevo",
  "xtralife-es": "XtraLife España",
  "on-digital-es": "On Digital España",
  "cashconverters-es": "Cash Converters España",
  todoconsolas: "TodoConsolas",
};

const reasonLabels: Record<string, string> = {
  region_no_confirmada: "Región no confirmada",
  sin_prueba_region: "Sin prueba de región",
  match_ambiguo: "Match ambiguo",
  estado_desconocido: "Estado desconocido",
  regional_variant_missing: "Falta la ficha de esa región",
  regional_variant_ambiguous: "Varias fichas regionales posibles",
  regional_signal_conflict: "Las pruebas regionales se contradicen",
  regional_confirmation_missing: "Falta confirmar la región",
  seller_origin_hint_only: "Ubicación del vendedor: solo una pista",
  catalog_match_not_unique: "La ficha exacta no está demostrada",
  catalog_title_not_exact: "Título o edición no exactos",
  catalog_region_not_exact: "Variante de otra región",
  listing_region_missing: "Falta confirmar la región",
  price_out_of_range: "Precio fuera del rango seguro",
  price_change_requires_review: "Cambio de precio anómalo",
  catalog_not_found: "No existe una ficha compatible",
};

const triageTabs: Array<{ value: PriceReviewTriageFilter; label: string; helper: string }> = [
  { value: "actionable", label: "Revisar ahora", helper: "Decisiones humanas pendientes" },
  { value: "catalog_gap", label: "Faltan fichas", helper: "Juegos aún sin destino en catálogo" },
  { value: "regional_variant", label: "Variantes", helper: "La región encontrada no coincide" },
  { value: "price_anomaly", label: "Precios anómalos", helper: "Importes que necesitan comprobación" },
  { value: "all", label: "Todos", helper: "Vista completa de pendientes" },
];

function uniqueOptions(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value?.trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function formatPrice(value: number | string | null | undefined): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(num);
}

function sourceLabel(value: string): string {
  if (sourceLabels[value]) return sourceLabels[value];
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function reasonLabel(value: string): string {
  if (reasonLabels[value]) return reasonLabels[value];
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function optionCounts<T extends string>(
  items: PriceReviewItem[],
  valueForItem: (item: PriceReviewItem) => T | null | undefined,
  labelForValue: (value: T) => string = (value) => value,
): Array<{ value: T; label: string; count: number }> {
  const counts = new Map<T, number>();
  for (const item of items) {
    const value = valueForItem(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labelForValue(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function ReviewCard({
  item,
  onDone,
}: {
  item: PriceReviewItem;
  onDone: (id: string) => void;
}) {
  const [catalogId, setCatalogId] = useState(item.catalogId ?? item.candidateCatalogId ?? "");
  const [region, setRegion] = useState(item.detectedRegion ?? item.targetRegion ?? "");
  const [condition, setCondition] = useState<PriceReviewCondition>((item.condition as PriceReviewCondition) || "unknown");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [cloneBaseCatalogId, setCloneBaseCatalogId] = useState(
    item.catalogId ?? item.candidateCatalogId ?? item.evidence?.searchedCatalogId ?? "",
  );
  const [cloneRegion, setCloneRegion] = useState(item.detectedRegion ?? item.targetRegion ?? "PAL España");
  const [cloneState, setCloneState] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [cloneMessage, setCloneMessage] = useState("");
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [mergeState, setMergeState] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [mergeMessage, setMergeMessage] = useState("");
  const alternatives = item.evidence?.matchAlternatives ?? [];
  const imageUrl = item.evidence?.imageUrl || item.evidence?.imageUrls?.[0] || null;
  const catalogOptions = uniqueOptions([
    item.catalogId,
    item.candidateCatalogId,
    ...alternatives.map((alt) => alt.catalogId),
    catalogId,
  ]);
  const cloneBaseOptions = uniqueOptions([
    ...catalogOptions,
    item.evidence?.searchedCatalogId,
    cloneBaseCatalogId,
  ]);
  const regionOptions = uniqueOptions([
    item.targetRegion,
    item.detectedRegion,
    ...alternatives.map((alt) => alt.region),
    ...commonRegionOptions,
    region,
    cloneRegion,
  ]);

  async function decide(action: "accept" | "reject") {
    setState("saving");
    setMessage("");
    const response = await fetch(`/api/admin/price-reviews/${encodeURIComponent(item.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, catalogId, region, condition, note }),
    });
    const data = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setState("error");
      setMessage(data?.error ?? "No se pudo guardar la decisión.");
      return;
    }
    onDone(item.id);
  }

  async function cloneRegionCatalog() {
    setCloneState("saving");
    setCloneMessage("");
    setMessage("");
    const response = await fetch(`/api/admin/price-reviews/${encodeURIComponent(item.id)}/clone-region`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceCatalogId: cloneBaseCatalogId, region: cloneRegion }),
    });
    const data = await response.json().catch(() => null) as { error?: string; catalogId?: string; region?: string; url?: string } | null;
    if (!response.ok || !data?.catalogId) {
      setCloneState("error");
      setCloneMessage(data?.error ?? "No se pudo crear la ficha regional.");
      return;
    }
    setCatalogId(data.catalogId);
    setCloneBaseCatalogId(data.catalogId);
    setRegion(data.region ?? cloneRegion);
    setCloneState("done");
    setCloneMessage(`Ficha creada: ${data.catalogId}. Ahora puedes aceptar el precio sobre esa ficha.`);
  }

  function toggleMergeId(value: string | null | undefined) {
    const clean = value?.trim();
    if (!clean) return;
    setMergeIds((current) => (current.includes(clean) ? current.filter((id) => id !== clean) : [...current, clean]));
  }

  async function mergeCatalogGames() {
    setMergeState("saving");
    setMergeMessage("");
    setMessage("");
    const response = await fetch(`/api/admin/price-reviews/${encodeURIComponent(item.id)}/merge-catalog`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogIds: mergeIds }),
    });
    const data = await response.json().catch(() => null) as {
      error?: string;
      targetCatalogId?: string;
      mergedCatalogIds?: string[];
    } | null;
    if (!response.ok || !data?.targetCatalogId) {
      setMergeState("error");
      setMergeMessage(data?.error ?? "No se pudieron fusionar las fichas.");
      return;
    }
    setCatalogId(data.targetCatalogId);
    setCloneBaseCatalogId(data.targetCatalogId);
    setMergeIds([data.targetCatalogId]);
    setMergeState("done");
    setMergeMessage(`Fusionadas en ${data.targetCatalogId}. Absorbidas: ${(data.mergedCatalogIds ?? []).join(", ") || "—"}.`);
  }

  return (
    <article className="rounded-2xl border border-border bg-background/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{sourceLabel(item.source)}</Badge>
            <Badge tone="amber">{reasonLabel(item.reason)}</Badge>
          </div>
          <h3 className="mt-2 text-base font-black text-foreground">{item.listingTitle}</h3>
          <p className="mt-1 text-xs text-muted">
            {item.platformSlug} · objetivo {item.targetRegion || "—"} · detectada {item.detectedRegion || "—"} · {formatDate(item.collectedAt)}
          </p>
        </div>
        <p className="text-xl font-black text-foreground">{formatPrice(item.priceEur)}</p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[120px_1fr]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-28 w-28 rounded-xl border border-border object-cover" />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-border bg-card/50 text-[11px] text-muted">
            Sin imagen
          </div>
        )}
        <div className="grid gap-2 text-xs text-muted md:grid-cols-2">
          <p><strong className="text-foreground">Juego candidato:</strong> {item.candidateCatalogId || item.catalogId || "—"}</p>
          <p><strong className="text-foreground">Ficha buscada:</strong> {item.evidence?.searchedCatalogId || "—"}</p>
          <p><strong className="text-foreground">Estado sugerido:</strong> {conditionLabels[String(item.condition || "unknown")] ?? item.condition}</p>
          <p><strong className="text-foreground">Match:</strong> {item.evidence?.matchMethod || "—"} {item.evidence?.matchScore != null ? `· score ${item.evidence.matchScore}` : ""}</p>
          <p><strong className="text-foreground">IA:</strong> {item.evidence?.aiConfidence != null ? `confianza ${item.evidence.aiConfidence}` : "no usada / sin dato"}</p>
          <p className="md:col-span-2">
            <strong className="text-foreground">Evidencia región:</strong>{" "}
            {(item.evidence?.regionEvidence ?? []).join(", ") || "sin prueba"}
          </p>
          {item.evidence?.originRegionHint ? (
            <p className="md:col-span-2">
              <strong className="text-foreground">Pista del vendedor:</strong>{" "}
              {item.evidence.originRegionHint}
              {item.evidence.originCountry ? ` (${item.evidence.originCountry})` : ""}. No confirma la edición.
            </p>
          ) : null}
          {item.evidence?.reviewNotes?.length ? (
            <p className="md:col-span-2"><strong className="text-foreground">Mini log:</strong> {item.evidence.reviewNotes.join(" · ")}</p>
          ) : null}
          {item.evidence?.url ? (
            <a href={item.evidence.url} target="_blank" rel="noreferrer" className="font-semibold text-accent md:col-span-2">
              Abrir anuncio/producto externo →
            </a>
          ) : null}
        </div>
      </div>

      {alternatives.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-card/45 p-3 text-xs text-muted">
          <p className="font-semibold text-foreground">Alternativas detectadas</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {alternatives.slice(0, 5).map((alt) => (
              <label
                key={`${alt.catalogId}-${alt.region}`}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-left font-semibold text-muted hover:border-accent hover:text-foreground"
              >
                <input
                  type="checkbox"
                  checked={Boolean(alt.catalogId && mergeIds.includes(alt.catalogId))}
                  onChange={() => toggleMergeId(alt.catalogId)}
                  className="h-3.5 w-3.5 accent-amber-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCatalogId(alt.catalogId ?? catalogId);
                    if (alt.region) setRegion(alt.region);
                  }}
                  className="text-left"
                >
                  {alt.catalogId} · {alt.region} · {alt.score}
                </button>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={mergeState === "saving" || mergeIds.length < 2}
              onClick={mergeCatalogGames}
              className="btn-secondary text-xs"
            >
              {mergeState === "saving" ? "Fusionando..." : "Fusionar fichas marcadas"}
            </button>
            <span className="text-[11px] text-muted">
              Marca 2 o más. La ficha madre será la más completa/con mejores precios.
            </span>
          </div>
          {mergeMessage ? (
            <p className={`mt-2 rounded-xl border px-3 py-2 text-xs ${mergeState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {mergeMessage}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <label className="text-xs font-semibold text-muted">
          Juego destino
          <select value={catalogId} onChange={(event) => setCatalogId(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent">
            <option value="">Selecciona juego</option>
            {catalogOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] font-normal leading-4 text-muted">Usa las alternativas detectadas si el candidato no es correcto.</span>
        </label>
        <label className="text-xs font-semibold text-muted">
          Región
          <select value={region} onChange={(event) => setRegion(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent">
            <option value="">Selecciona región</option>
            {regionOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Estado
          <select value={condition} onChange={(event) => setCondition(event.target.value as PriceReviewCondition)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent">
            {Object.entries(conditionLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Nota
          <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent" />
        </label>
      </div>
      <div className="mt-3 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-3 dark:border-amber-400/30 dark:bg-amber-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-foreground">Crear ficha para otra región</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Úsalo cuando el anuncio pertenezca a una región para la que aún no exista ficha. Copia los datos de la ficha buscada y crea la variante regional nueva.
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-semibold text-muted">
            Ficha base a copiar
            <select
              value={cloneBaseCatalogId}
              onChange={(event) => setCloneBaseCatalogId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
            >
              <option value="">Selecciona ficha base</option>
              {cloneBaseOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Nueva región
            <select
              value={cloneRegion}
              onChange={(event) => setCloneRegion(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
            >
              <option value="">Selecciona región</option>
              {regionOptions.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={cloneState === "saving" || !cloneBaseCatalogId || !cloneRegion}
            onClick={cloneRegionCatalog}
            className="btn-secondary self-end text-xs"
          >
            {cloneState === "saving" ? "Creando..." : "Crear ficha"}
          </button>
        </div>
        {cloneMessage ? (
          <p className={`mt-3 rounded-xl border px-3 py-2 text-xs ${cloneState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {cloneMessage}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={state === "saving"} onClick={() => decide("accept")} className="btn-primary text-xs">
          Aceptar verificado
        </button>
        <button type="button" disabled={state === "saving"} onClick={() => decide("reject")} className="btn-secondary text-xs">
          Rechazar
        </button>
        {state === "error" ? <span className="text-xs font-semibold text-rose-600 dark:text-rose-300">{message}</span> : null}
      </div>
    </article>
  );
}

export function AdminPriceReviewPanel({ initialItems, initialCounts, initialTotal }: Props) {
  const [items, setItems] = useState(initialItems);
  const [triageCounts, setTriageCounts] = useState(initialCounts);
  const [totalPending, setTotalPending] = useState(initialTotal);
  const [activeBucket, setActiveBucket] = useState<PriceReviewTriageFilter>("actionable");
  const [autoState, setAutoState] = useState<"idle" | "previewing" | "applying" | "error" | "done">("idle");
  const [autoResult, setAutoResult] = useState<AutoRetroplayzoneResponse | null>(null);
  const [pcVisionState, setPcVisionState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [pcVisionMessage, setPcVisionMessage] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(40);
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "error">("idle");
  const [refreshMessage, setRefreshMessage] = useState("");
  const [assumedRegion, setAssumedRegion] = useState("");
  const [assumedCondition, setAssumedCondition] = useState<PriceReviewCondition | "none">("none");
  const [useVision, setUseVision] = useState(false);
  const [visionLimit, setVisionLimit] = useState(10);
  const activeBucketMeta = triageTabs.find((tab) => tab.value === activeBucket) ?? triageTabs[0];
  const activeBucketTotal = triageCounts[activeBucket] ?? 0;

  const platformOptions = useMemo(
    () => optionCounts(items, (item) => item.platformSlug, (value) => value.toUpperCase()),
    [items],
  );
  const sourceOptions = useMemo(
    () => optionCounts(items, (item) => item.source, sourceLabel),
    [items],
  );
  const filteredItems = useMemo(() => {
    const cleanQuery = normalizedText(query);
    return items.filter((item) => {
      if (platformFilter !== "all" && item.platformSlug !== platformFilter) return false;
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (!cleanQuery) return true;
      const haystack = normalizedText([
        item.listingTitle,
        item.catalogId,
        item.candidateCatalogId,
        item.targetRegion,
        item.detectedRegion,
        item.reason,
        item.source,
        item.platformSlug,
      ].filter(Boolean).join(" "));
      return haystack.includes(cleanQuery);
    });
  }, [items, platformFilter, query, sourceFilter]);
  const visibleItems = filteredItems.slice(0, visibleLimit);
  const gamePs4Pending = items.filter((item) => item.platformSlug === "ps4" && item.source.startsWith("game-es")).length;
  const activeReviewLabel = [
    activeBucketMeta.label,
    platformFilter !== "all" ? platformFilter.toUpperCase() : null,
    sourceFilter !== "all" ? sourceLabel(sourceFilter) : null,
    query.trim() ? `Busqueda: ${query.trim()}` : null,
    assumedRegion ? `Region: ${assumedRegion}` : null,
    assumedCondition !== "none" ? `Estado: ${conditionLabels[assumedCondition]}` : null,
    useVision ? `IA portadas: ${visionLimit}` : null,
  ].filter(Boolean).join(" · ") || "Toda la cola cargada";

  function resetAutoPreview() {
    setAutoResult(null);
    setAutoState("idle");
    setPcVisionState("idle");
    setPcVisionMessage("");
  }

  function updatePlatformFilter(value: string) {
    setPlatformFilter(value);
    setVisibleLimit(40);
    resetAutoPreview();
  }

  function updateSourceFilter(value: string) {
    setSourceFilter(value);
    setVisibleLimit(40);
    resetAutoPreview();
  }

  function updateQuery(value: string) {
    setQuery(value);
    setVisibleLimit(40);
    resetAutoPreview();
  }

  function clearFilters() {
    setPlatformFilter("all");
    setSourceFilter("all");
    setQuery("");
    setVisibleLimit(40);
    setAssumedRegion("");
    setAssumedCondition("none");
    setUseVision(false);
    setVisionLimit(10);
    resetAutoPreview();
  }

  function selectTriageBucket(value: PriceReviewTriageFilter) {
    if (value === activeBucket || refreshState === "loading") return;
    setActiveBucket(value);
    setItems([]);
    setPlatformFilter("all");
    setSourceFilter("all");
    setQuery("");
    setVisibleLimit(40);
    resetAutoPreview();
    void refreshItems(value);
  }

  function updateAssumedRegion(value: string) {
    setAssumedRegion(value);
    resetAutoPreview();
  }

  function updateAssumedCondition(value: PriceReviewCondition | "none") {
    setAssumedCondition(value);
    resetAutoPreview();
  }

  function updateUseVision(value: boolean) {
    setUseVision(value);
    resetAutoPreview();
  }

  function updateVisionLimit(value: number) {
    setVisionLimit(value);
    resetAutoPreview();
  }

  async function refreshItems(bucket: PriceReviewTriageFilter = activeBucket) {
    setRefreshState("loading");
    setRefreshMessage("");
    const response = await fetch(`/api/admin/price-reviews?limit=500&bucket=${encodeURIComponent(bucket)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as {
      ok?: boolean;
      items?: PriceReviewItem[];
      counts?: PriceReviewTriageCounts;
      total?: number;
      error?: string;
    } | null;
    if (!response.ok || !data?.ok || !Array.isArray(data.items)) {
      setRefreshState("error");
      setRefreshMessage(data?.error ?? "No se pudo actualizar la cola.");
      return;
    }
    setItems(data.items);
    if (data.counts) setTriageCounts(data.counts);
    if (typeof data.total === "number") setTotalPending(data.total);
    setRefreshState("idle");
    setRefreshMessage(`${data.items.length} de ${data.counts?.[bucket] ?? data.items.length} cargados.`);
    resetAutoPreview();
  }

  async function runAutoRetroplayzone(apply: boolean) {
    setAutoState(apply ? "applying" : "previewing");
    const response = await fetch("/api/admin/price-reviews/auto-retroplayzone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apply,
        platformSlug: platformFilter === "all" ? undefined : platformFilter,
        source: sourceFilter === "all" ? undefined : sourceFilter,
        query: query.trim() || undefined,
        assumedRegion: assumedRegion || undefined,
        assumedCondition,
        useVision,
        visionLimit,
        triageBucket: activeBucket,
      }),
    });
    const rawText = await response.text().catch(() => "");
    let data: AutoRetroplayzoneResponse | null = null;
    try {
      data = rawText ? JSON.parse(rawText) as AutoRetroplayzoneResponse : null;
    } catch {
      data = null;
    }
    if (!response.ok || !data?.ok) {
      const detail = data?.error
        ?? rawText.slice(0, 500).trim()
        ?? `HTTP ${response.status}`;
      setAutoResult({ error: `No se pudo revisar automáticamente. ${detail}` });
      setAutoState("error");
      return;
    }
    setAutoResult(data);
    setAutoState("done");
    if (apply) {
      const acceptedIds = new Set((data.candidates ?? []).filter((candidate) => candidate.decision === "accept").map((candidate) => candidate.id));
      setItems((current) => current.filter((item) => !acceptedIds.has(item.id)));
      await refreshItems();
    }
  }

  async function sendPcVisionJob() {
    setPcVisionState("sending");
    setPcVisionMessage("");
    const response = await fetch("/api/admin/price-reviews/pc-vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platformSlug: platformFilter === "all" ? undefined : platformFilter,
        source: sourceFilter === "all" ? undefined : sourceFilter,
        query: query.trim() || undefined,
        assumedRegion: assumedRegion || undefined,
        assumedCondition,
        visionLimit,
        triageBucket: activeBucket,
      }),
    });
    const rawText = await response.text().catch(() => "");
    let data: { ok?: boolean; jobId?: string; message?: string; error?: string } | null = null;
    try {
      data = rawText ? JSON.parse(rawText) as { ok?: boolean; jobId?: string; message?: string; error?: string } : null;
    } catch {
      data = null;
    }
    if (!response.ok || !data?.ok) {
      setPcVisionState("error");
      setPcVisionMessage(data?.error ?? rawText.slice(0, 500).trim() ?? `HTTP ${response.status}`);
      return;
    }
    setPcVisionState("sent");
    setPcVisionMessage(`${data.message ?? "Job enviado al PC."}${data.jobId ? ` ID: ${data.jobId}` : ""}`);
  }

  function markItemDone(id: string) {
    const completed = items.find((item) => item.id === id);
    setItems((current) => current.filter((item) => item.id !== id));
    if (!completed) return;
    setTotalPending((current) => Math.max(0, current - 1));
    setTriageCounts((current) => {
      const next = { ...current, all: Math.max(0, current.all - 1) };
      const bucket = completed.triageBucket;
      if (bucket && bucket !== "resolved_exact" && bucket in next) {
        next[bucket as keyof PriceReviewTriageCounts] = Math.max(
          0,
          current[bucket as keyof PriceReviewTriageCounts] - 1,
        );
      }
      if (bucket === "manual_match" || bucket === "missing_region") {
        next.actionable = Math.max(0, current.actionable - 1);
      }
      return next;
    });
  }

  return (
    <Panel className={adminToneClass("edit")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PanelTitle eyebrow="Precios a revisar">Anuncios pendientes de revisión</PanelTitle>
          <p className="mt-2 text-sm leading-6 text-muted">
            Los casos están separados por el tipo de decisión que necesitan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {gamePs4Pending > 0 ? <Badge tone="amber">GAME PS4: {gamePs4Pending}</Badge> : null}
          <Badge tone={totalPending > 0 ? "amber" : "green"}>{totalPending} pendientes totales</Badge>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="tablist" aria-label="Bandejas de revisión">
        {triageTabs.map((tab) => {
          const selected = activeBucket === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={refreshState === "loading"}
              onClick={() => selectTriageBucket(tab.value)}
              className={`min-h-20 rounded-xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border bg-background/50 text-muted hover:border-accent/50 hover:text-foreground"
              }`}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-black">
                <span>{tab.label}</span>
                <span className="tabular-nums">{triageCounts[tab.value]}</span>
              </span>
              <span className="mt-1 block text-xs leading-4">{tab.helper}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-background/50 p-3">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
          <label className="text-xs font-semibold text-muted">
            Plataforma
            <select
              value={platformFilter}
              onChange={(event) => updatePlatformFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
            >
              <option value="all">Todas ({items.length})</option>
              {platformOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Fuente
            <select
              value={sourceFilter}
              onChange={(event) => updateSourceFilter(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
            >
              <option value="all">Todas ({items.length})</option>
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({option.count})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-muted">
            Buscar
            <input
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              placeholder="Título, ficha, región..."
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
            />
          </label>
          <div className="flex items-end gap-2">
            <button type="button" onClick={clearFilters} className="btn-secondary text-xs">
              Limpiar
            </button>
            <button type="button" disabled={refreshState === "loading"} onClick={() => refreshItems()} className="btn-secondary text-xs">
              {refreshState === "loading" ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>
            Mostrando {visibleItems.length} de {filteredItems.length} filtrados.
            {items.length < activeBucketTotal ? ` La bandeja contiene ${activeBucketTotal}; usa los filtros para afinar.` : ""}
          </span>
          {refreshMessage ? (
            <span className={refreshState === "error" ? "font-semibold text-rose-600 dark:text-rose-300" : "font-semibold text-emerald-600 dark:text-emerald-300"}>
              {refreshMessage}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-background/50 p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm font-black text-foreground">Auto-revisar cola filtrada</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Objetivo actual: {activeReviewLabel}. Primero hace una vista previa; solo acepta automáticamente si región, estado y juego están claros.
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <label className="text-xs font-semibold text-muted">
                Asumir región
                <select
                  value={assumedRegion}
                  onChange={(event) => updateAssumedRegion(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
                >
                  <option value="">No asumir</option>
                  {commonRegionOptions.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted">
                Asumir estado
                <select
                  value={assumedCondition}
                  onChange={(event) => updateAssumedCondition(event.target.value as PriceReviewCondition | "none")}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
                >
                  <option value="none">No asumir</option>
                  {Object.entries(conditionLabels)
                    .filter(([value]) => value !== "unknown")
                    .map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <div className="rounded-xl border border-border bg-background px-3 py-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={useVision}
                    onChange={(event) => updateUseVision(event.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  Usar IA de portadas
                </label>
                <label className="mt-2 block text-xs font-semibold text-muted">
                  Máx. portadas
                  <select
                    value={visionLimit}
                    disabled={!useVision}
                    onChange={(event) => updateVisionLimit(Number(event.target.value))}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-accent disabled:opacity-50"
                  >
                    {[5, 10, 15, 25].map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap content-start gap-2 lg:justify-end">
            <button
              type="button"
              disabled={pcVisionState === "sending" || filteredItems.length === 0}
              onClick={sendPcVisionJob}
              className="btn-secondary text-xs"
            >
              {pcVisionState === "sending" ? "Enviando al PC..." : "Enviar IA al PC"}
            </button>
            <button
              type="button"
              disabled={autoState === "previewing" || autoState === "applying" || filteredItems.length === 0}
              onClick={() => runAutoRetroplayzone(false)}
              className="btn-secondary text-xs"
            >
              {autoState === "previewing" ? "Revisando..." : "Vista previa"}
            </button>
            <button
              type="button"
              disabled={autoState === "previewing" || autoState === "applying" || !autoResult?.accepted}
              onClick={() => runAutoRetroplayzone(true)}
              className="btn-primary text-xs"
            >
              {autoState === "applying" ? "Aplicando..." : "Aplicar seguros"}
            </button>
          </div>
        </div>
        {pcVisionMessage ? (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${pcVisionState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
            <p className="font-semibold">{pcVisionMessage}</p>
          </div>
        ) : null}
        {autoResult ? (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${autoState === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {autoState === "error" ? (
              <p className="font-semibold">{autoResult.error ?? "No se pudo revisar automáticamente."}</p>
            ) : (
              <>
                <p className="font-semibold">
                  {autoResult.label ?? activeReviewLabel}: {autoResult.totalPending ?? autoResult.totalRetroplayzonePending ?? 0} pendientes · {autoResult.accepted ?? 0} seguros · {autoResult.skipped ?? 0} siguen en revisión.
                </p>
                {autoResult.mode === "apply" ? (
                  <p className="mt-1">
                    Aplicado. Worker externo: {autoResult.workerSynced ? "sincronizado" : `pendiente/no sincronizado${autoResult.workerSyncError ? ` (${autoResult.workerSyncError})` : ""}`}.
                  </p>
                ) : null}
                {autoResult.candidates?.length ? (
                  <div className="mt-2 grid gap-1 text-[11px]">
                    {autoResult.candidates.slice(0, 8).map((candidate) => (
                      <p key={candidate.id}>
                        <strong>{candidate.decision === "accept" ? "Aceptaría" : "Deja"}:</strong> {candidate.listingTitle} · {candidate.region || "sin región"} · {conditionLabels[String(candidate.condition || "unknown")] ?? "estado desconocido"} · {candidate.reason}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
      {filteredItems.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {visibleItems.map((item) => (
            <ReviewCard key={item.id} item={item} onDone={markItemDone} />
          ))}
          {visibleItems.length < filteredItems.length ? (
            <button type="button" onClick={() => setVisibleLimit((current) => current + 40)} className="btn-secondary justify-self-center text-xs">
              Ver 40 más
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-border bg-background/45 p-3 text-sm text-muted">
          No hay precios pendientes con esos filtros. Cuando un collector marque región, match o estado como dudoso aparecerá aquí.
        </p>
      )}
    </Panel>
  );
}

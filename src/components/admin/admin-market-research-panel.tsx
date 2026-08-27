"use client";

/* eslint-disable @next/next/no-img-element -- external admin evidence must not enter the public image cache */

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  ExternalLink,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import type { CoverResearchCandidate, CoverResearchResult } from "@/lib/cover-research";
import type {
  EbayConditionEstimate,
  EbayResearchListing,
  EbayResearchReport,
} from "@/lib/ebay/ebay-research";
import type {
  MarketObservation,
  MarketResearchCatalogView,
  MarketResearchEstimate,
  StoredCoverCandidate,
} from "@/lib/market-research-types";

type Props = { catalogId: string; initialStored: MarketResearchCatalogView };
type View = "prices" | "covers" | "listings";
type ApiResponse = {
  ok?: boolean;
  error?: string;
  readOnly?: boolean;
  ebay?: EbayResearchReport;
  covers?: CoverResearchResult;
  stored?: MarketResearchCatalogView;
  routed?: number;
  pendingRouting?: number;
};

const CONDITION_LABELS: Record<EbayConditionEstimate["condition"], string> = {
  loose: "Suelto",
  game_manual: "Juego + manual",
  complete: "Completo",
  sealed: "Precintado",
};

const DECISION_LABELS: Record<EbayResearchListing["decision"], string> = {
  accept: "Esta variante",
  review: "Revisar",
  other_variant: "Otra variante",
  reject: "No válido",
};

const ASSET_LABELS: Record<import("@/lib/cover-research").CoverAssetKind, string> = {
  physical_cover: "Carátula física",
  store_capsule: "Cápsula digital",
  key_art: "Arte promocional",
  listing_photo: "Foto de anuncio",
};

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function decisionClass(decision: EbayResearchListing["decision"]): string {
  if (decision === "accept") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  if (decision === "review") return "border-amber-400/40 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  if (decision === "other_variant") return "border-sky-400/40 bg-sky-500/10 text-sky-800 dark:text-sky-200";
  return "border-border bg-background text-muted";
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`min-h-10 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
        active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function PriceResults({
  estimates,
  publishing,
  onPublish,
}: {
  estimates: Array<EbayConditionEstimate | MarketResearchEstimate>;
  publishing: string | null;
  onPublish?: (condition: EbayConditionEstimate["condition"]) => void;
}) {
  if (estimates.length === 0) {
    return <p className="py-8 text-sm text-muted">No hay anuncios válidos y clasificables para calcular precio.</p>;
  }
  return (
    <div className="divide-y divide-border">
      {estimates.map((estimate) => {
        const stored = "publishable" in estimate;
        return (
          <div key={`${estimate.condition}-${estimate.currency}`} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
            <div>
              <p className="font-semibold text-foreground">{CONDITION_LABELS[estimate.condition]}</p>
              <p className="mt-1 text-xs text-muted">
                {estimate.observations} anuncio(s) · {money(estimate.minimum, estimate.currency)} a {money(estimate.maximum, estimate.currency)}
                {stored && estimate.outliers > 0 ? ` · ${estimate.outliers} atípico(s) fuera` : ""}
              </p>
            </div>
            <p className="text-lg font-bold text-foreground">{money(estimate.median, estimate.currency)}</p>
            <div className="text-xs text-muted sm:text-right">
              <p>Artículo</p>
              {estimate.shippingMedian != null && (
                <p>Envío: {money(estimate.shippingMedian, estimate.currency)}</p>
              )}
              {estimate.totalToSpainMedian != null && (
                <p className="font-semibold text-foreground">
                  A España: {money(estimate.totalToSpainMedian, estimate.currency)}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${
                estimate.verified
                  ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                  : estimate.label === "estimated"
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                    : "bg-muted/10 text-muted"
              }`}>
                {estimate.verified ? "Verificado" : estimate.label === "estimated" ? "Estimación" : "Orientativo"}
              </span>
              {stored && estimate.publishable && onPublish && (
                <button type="button" onClick={() => onPublish(estimate.condition)} disabled={publishing === estimate.condition} className="btn-secondary inline-flex min-h-9 items-center gap-1.5 text-xs">
                  {publishing === estimate.condition ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Upload size={14} aria-hidden="true" />}
                  Publicar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CoverResults({
  candidates,
  deciding,
  onDecision,
}: {
  candidates: Array<CoverResearchCandidate | StoredCoverCandidate>;
  deciding: string | null;
  onDecision?: (candidate: StoredCoverCandidate, action: "approve" | "reject") => void;
}) {
  if (candidates.length === 0) {
    return <p className="py-8 text-sm text-muted">No se han encontrado candidatos de portada.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {candidates.map((candidate) => {
        const stored = "status" in candidate;
        return (
          <article key={candidate.id} className="overflow-hidden rounded-lg border border-border bg-background">
            <div className="aspect-[3/4] bg-muted/10">
              <img src={candidate.imageUrl} alt={candidate.title ?? `Candidato de ${candidate.sourceLabel}`} className="h-full w-full object-contain" loading="lazy" />
            </div>
            <div className="space-y-2 border-t border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-foreground">{candidate.sourceLabel}</p>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                  stored && candidate.status === "approved"
                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                    : stored && candidate.status === "rejected"
                      ? "bg-red-500/10 text-red-800 dark:text-red-200"
                      : candidate.persistence === "temporary_only"
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                        : "bg-sky-500/15 text-sky-800 dark:text-sky-200"
                }`}>
                  {stored && candidate.status !== "pending" ? candidate.status === "approved" ? "Aprobada" : "Descartada" : candidate.persistence === "temporary_only" ? "Temporal" : "Revisar"}
                </span>
              </div>
              <p className="line-clamp-2 min-h-10 text-sm text-muted">{candidate.title ?? "Sin título de origen"}</p>
              <p className="text-[11px] font-semibold uppercase text-muted">{ASSET_LABELS[candidate.assetKind]}</p>
              {candidate.regionMatch === "other_variant" && <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">Variante: {candidate.suggestedRegion ?? "otra región"}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {candidate.sourcePageUrl && <a href={candidate.sourcePageUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-accent">Abrir fuente <ExternalLink size={13} aria-hidden="true" /></a>}
                {stored && candidate.status === "pending" && candidate.persistence === "review_required" && onDecision && (
                  <button type="button" onClick={() => onDecision(candidate, "approve")} disabled={deciding === candidate.id} className="btn-secondary inline-flex min-h-9 items-center gap-1 text-xs">
                    {deciding === candidate.id ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />} Aprobar
                  </button>
                )}
                {stored && candidate.status === "pending" && onDecision && <button type="button" onClick={() => onDecision(candidate, "reject")} disabled={deciding === candidate.id} className="btn-secondary inline-flex min-h-9 items-center gap-1 text-xs"><X size={14} aria-hidden="true" /> Descartar</button>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function LiveListingResults({ listings }: { listings: EbayResearchListing[] }) {
  if (listings.length === 0) return <p className="py-8 text-sm text-muted">eBay no devolvió anuncios utilizables.</p>;
  return (
    <div className="divide-y divide-border">
      {listings.map((listing) => (
        <article key={listing.itemId} className="grid gap-3 py-4 sm:grid-cols-[64px_1fr_auto] sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/10">
            {listing.imageUrls[0] ? <img src={listing.imageUrls[0]} alt="" className="h-full w-full object-contain" loading="lazy" /> : <ImageIcon size={22} className="text-muted" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{listing.title}</p>
            <p className="mt-1 text-xs text-muted">{listing.reasons.join(" · ")}</p>
            {listing.decision === "other_variant" && <p className="mt-1 text-xs font-semibold text-sky-700 dark:text-sky-300">Asignable a {listing.suggestedRegion ?? "otra variante regional"}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            {listing.price != null && listing.currency && <p className="font-bold text-foreground">Artículo: {money(listing.price, listing.currency)}</p>}
            {listing.shippingPrice != null && listing.currency && <p className="text-xs text-muted">Envío: {money(listing.shippingPrice, listing.currency)}</p>}
            {listing.totalPrice != null && listing.currency && <p className="text-xs font-semibold text-foreground">A España: {money(listing.totalPrice, listing.currency)}</p>}
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${decisionClass(listing.decision)}`}>{DECISION_LABELS[listing.decision]}</span>
            {listing.url && <a href={listing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">Ver anuncio <ExternalLink size={13} aria-hidden="true" /></a>}
          </div>
        </article>
      ))}
    </div>
  );
}

function StoredListingResults({
  catalogId,
  observations,
  deciding,
  onReview,
}: {
  catalogId: string;
  observations: MarketObservation[];
  deciding: string | null;
  onReview: (observation: MarketObservation, status: "accepted" | "rejected") => void;
}) {
  if (observations.length === 0) return <p className="py-8 text-sm text-muted">Todavía no hay evidencias guardadas.</p>;
  return (
    <div className="divide-y divide-border">
      {observations.map((observation) => (
        <article key={observation.id} className="grid gap-3 py-4 sm:grid-cols-[64px_1fr_auto] sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/10">
            {observation.imageUrls[0] ? <img src={observation.imageUrls[0]} alt="" className="h-full w-full object-contain" loading="lazy" /> : <ImageIcon size={22} className="text-muted" aria-hidden="true" />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{observation.title}</p>
            <p className="mt-1 text-xs text-muted">{observation.marketplaceId} · {observation.sellerCountry ?? "origen no indicado"} · vista {observation.seenCount} vez/veces</p>
            {observation.originCatalogId !== catalogId && <p className="mt-1 text-xs font-semibold text-sky-700 dark:text-sky-300">Redirigida desde {observation.originCatalogId}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:max-w-56 sm:justify-end">
            {observation.price != null && observation.currency && <p className="w-full text-right font-bold text-foreground">Artículo: {money(observation.price, observation.currency)}</p>}
            {observation.shippingPrice != null && observation.currency && <p className="w-full text-right text-xs text-muted">Envío: {money(observation.shippingPrice, observation.currency)}</p>}
            {observation.totalPrice != null && observation.currency && <p className="w-full text-right text-xs font-semibold text-foreground">A España: {money(observation.totalPrice, observation.currency)}</p>}
            <span className={`rounded-full px-2 py-1 text-xs font-bold ${observation.reviewStatus === "accepted" ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : observation.reviewStatus === "pending" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-red-500/10 text-red-800 dark:text-red-200"}`}>
              {observation.reviewStatus === "accepted" ? "Aceptado" : observation.reviewStatus === "pending" ? "Pendiente" : "Descartado"}
            </span>
            {observation.reviewStatus !== "accepted" && <button type="button" onClick={() => onReview(observation, "accepted")} disabled={deciding === observation.id} className="btn-secondary inline-flex min-h-9 items-center gap-1 text-xs"><Check size={14} aria-hidden="true" /> Aceptar</button>}
            {observation.reviewStatus !== "rejected" && <button type="button" onClick={() => onReview(observation, "rejected")} disabled={deciding === observation.id} className="btn-secondary inline-flex min-h-9 items-center gap-1 text-xs"><X size={14} aria-hidden="true" /> Excluir</button>}
            {observation.url && <a href={observation.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-accent">eBay <ExternalLink size={13} aria-hidden="true" /></a>}
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminMarketResearchPanel({ catalogId, initialStored }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>("prices");
  const [loading, setLoading] = useState<"analyze" | "collect" | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [stored, setStored] = useState(initialStored);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [decidingObservation, setDecidingObservation] = useState<string | null>(null);
  const [decidingCover, setDecidingCover] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runResearch(persist: boolean) {
    setLoading(persist ? "collect" : "analyze");
    setError(null);
    setMessage(null);
    try {
      const suffix = persist ? "/collect" : "";
      const response = await fetch(`/api/admin/catalog/${encodeURIComponent(catalogId)}/market-research${suffix}`, { method: "POST" });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.ebay || !payload.covers) throw new Error(payload.error ?? "No se pudo completar el análisis.");
      setData(payload);
      if (payload.stored) setStored(payload.stored);
      if (persist) setMessage(`Evidencias guardadas${payload.routed ? `; ${payload.routed} anuncio(s) enviados a su variante regional` : ""}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de red durante el análisis.");
    } finally {
      setLoading(null);
    }
  }

  async function publish(condition: EbayConditionEstimate["condition"]) {
    setPublishing(condition);
    setError(null);
    try {
      const response = await fetch(`/api/admin/catalog/${encodeURIComponent(catalogId)}/market-research/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ condition }),
      });
      const payload = await response.json() as { error?: string; stored?: MarketResearchCatalogView };
      if (!response.ok || !payload.stored) throw new Error(payload.error ?? "No se pudo publicar el precio.");
      setStored(payload.stored);
      setMessage(`${CONDITION_LABELS[condition]} publicado desde la mediana verificada.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de red al publicar el precio.");
    } finally {
      setPublishing(null);
    }
  }

  async function reviewObservation(observation: MarketObservation, status: "accepted" | "rejected") {
    setDecidingObservation(observation.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/catalog/${encodeURIComponent(catalogId)}/market-research/observations/${encodeURIComponent(observation.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json() as { error?: string; stored?: MarketResearchCatalogView };
      if (!response.ok || !payload.stored) throw new Error(payload.error ?? "No se pudo guardar la decisión.");
      setStored(payload.stored);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de red al revisar el anuncio.");
    } finally {
      setDecidingObservation(null);
    }
  }

  async function decideCover(candidate: StoredCoverCandidate, action: "approve" | "reject") {
    const requiresConfirmation = candidate.platformMatch !== "exact" || candidate.regionMatch !== "exact";
    if (action === "approve" && requiresConfirmation) {
      const accepted = window.confirm("La plataforma o la región no están verificadas como exactas. ¿Publicar igualmente esta imagen?");
      if (!accepted) return;
    }
    setDecidingCover(candidate.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/catalog/${encodeURIComponent(catalogId)}/market-research/covers/${encodeURIComponent(candidate.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmMismatch: action === "approve" && requiresConfirmation }),
      });
      const payload = await response.json() as { error?: string; stored?: MarketResearchCatalogView; coverUrl?: string };
      if (!response.ok || !payload.stored) throw new Error(payload.error ?? "No se pudo aplicar la decisión.");
      setStored(payload.stored);
      setMessage(action === "approve" ? "Portada importada y publicada en nuestra copia." : "Candidato descartado.");
      if (payload.coverUrl) router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error de red al revisar la portada.");
    } finally {
      setDecidingCover(null);
    }
  }

  const warnings = [...new Set([...(data?.ebay?.warnings ?? []), ...(data?.covers?.warnings ?? [])])];
  const hasStoredData = stored.observations.length > 0 || stored.coverCandidates.length > 0;
  const showLiveData = data?.readOnly === true;
  const estimates = showLiveData ? data?.ebay?.estimates ?? [] : hasStoredData ? stored.estimates : [];
  const covers = showLiveData ? data?.covers?.candidates ?? [] : hasStoredData ? stored.coverCandidates : [];

  return (
    <Panel className={adminToneClass("search")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PanelTitle>Mercado y portadas</PanelTitle>
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <ShieldCheck size={15} aria-hidden="true" />
            {stored.lastCollectedAt ? `Última recopilación: ${new Date(stored.lastCollectedAt).toLocaleString("es-ES")}` : "Sin evidencias guardadas"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => runResearch(false)} disabled={loading !== null} className="btn-secondary inline-flex min-h-11 items-center gap-2 text-sm">
            {loading === "analyze" ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
            Analizar sin guardar
          </button>
          <button type="button" onClick={() => runResearch(true)} disabled={loading !== null} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {loading === "collect" ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : <Database size={17} aria-hidden="true" />}
            Recopilar y guardar
          </button>
        </div>
      </div>

      {error && <p className="mt-5 flex items-center gap-2 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm font-semibold text-red-800 dark:text-red-200"><AlertTriangle size={17} aria-hidden="true" />{error}</p>}
      {message && <p className="mt-5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{message}</p>}

      {(data?.ebay || hasStoredData) && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="border-l-2 border-emerald-500 px-3"><p className="text-2xl font-bold">{showLiveData ? data?.ebay?.counts.accept ?? 0 : stored.counts.accepted}</p><p className="text-xs text-muted">Aceptados</p></div>
            <div className="border-l-2 border-amber-500 px-3"><p className="text-2xl font-bold">{showLiveData ? data?.ebay?.counts.review ?? 0 : stored.counts.pending}</p><p className="text-xs text-muted">Por revisar</p></div>
            <div className="border-l-2 border-sky-500 px-3"><p className="text-2xl font-bold">{data?.routed ?? data?.ebay?.counts.other_variant ?? 0}</p><p className="text-xs text-muted">Otras variantes</p></div>
            <div className="border-l-2 border-border px-3"><p className="text-2xl font-bold">{showLiveData ? data?.ebay?.counts.reject ?? 0 : stored.counts.rejected}</p><p className="text-xs text-muted">Descartados</p></div>
            <div className="border-l-2 border-accent px-3"><p className="text-2xl font-bold">{covers.length}</p><p className="text-xs text-muted">Portadas candidatas</p></div>
          </div>

          {data?.ebay && (data.ebay.target.gtins.length > 0 || data.ebay.identifierCandidates.epids.length > 0) && <p className="mt-4 text-xs text-muted">EAN: {data.ebay.target.gtins.join(", ") || "—"}{data.ebay.identifierCandidates.epids.length > 0 ? ` · ePID candidato: ${data.ebay.identifierCandidates.epids.map((entry) => entry.value).join(", ")}` : ""}</p>}

          <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Datos de mercado">
            <TabButton active={view === "prices"} onClick={() => setView("prices")}>Precios actuales</TabButton>
            <TabButton active={view === "covers"} onClick={() => setView("covers")}>Portadas</TabButton>
            <TabButton active={view === "listings"} onClick={() => setView("listings")}>Evidencias</TabButton>
          </div>

          <div className="pt-2">
            {view === "prices" && <PriceResults estimates={estimates} publishing={publishing} onPublish={!showLiveData && hasStoredData ? publish : undefined} />}
            {view === "covers" && <CoverResults candidates={covers} deciding={decidingCover} onDecision={!showLiveData && hasStoredData ? decideCover : undefined} />}
            {view === "listings" && (showLiveData ? <LiveListingResults listings={data?.ebay?.listings ?? []} /> : <StoredListingResults catalogId={catalogId} observations={stored.observations} deciding={decidingObservation} onReview={reviewObservation} />)}
          </div>

          {warnings.length > 0 && (
            <details className="mt-5 border-t border-border pt-4">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200"><AlertTriangle size={16} aria-hidden="true" /> Avisos de la consulta ({warnings.length})</summary>
              <ul className="mt-3 space-y-1 text-xs text-muted">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}
        </>
      )}
    </Panel>
  );
}

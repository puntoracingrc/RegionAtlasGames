"use client";

/* eslint-disable @next/next/no-img-element -- transient admin candidates must not enter the Vercel image cache */

import { useState } from "react";
import { AlertTriangle, ExternalLink, ImageIcon, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { adminToneClass } from "@/components/admin/admin-visual";
import { Panel, PanelTitle } from "@/components/ui";
import type { CoverResearchResult } from "@/lib/cover-research";
import type {
  EbayConditionEstimate,
  EbayResearchListing,
  EbayResearchReport,
} from "@/lib/ebay/ebay-research";

type Props = { catalogId: string };
type View = "prices" | "covers" | "listings";
type ApiResponse = {
  ok?: boolean;
  error?: string;
  readOnly?: boolean;
  ebay?: EbayResearchReport;
  covers?: CoverResearchResult;
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
      onClick={onClick}
      className={`min-h-10 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
        active ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function PriceResults({ ebay }: { ebay: EbayResearchReport }) {
  if (ebay.estimates.length === 0) {
    return <p className="py-8 text-sm text-muted">No hay suficientes anuncios válidos y clasificables para calcular precio.</p>;
  }
  return (
    <div className="divide-y divide-border">
      {ebay.estimates.map((estimate) => (
        <div key={`${estimate.condition}-${estimate.currency}`} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div>
            <p className="font-semibold text-foreground">{CONDITION_LABELS[estimate.condition]}</p>
            <p className="mt-1 text-xs text-muted">
              {estimate.observations} anuncio(s) · {money(estimate.minimum, estimate.currency)} a {money(estimate.maximum, estimate.currency)}
            </p>
          </div>
          <p className="text-lg font-bold text-foreground">{money(estimate.median, estimate.currency)}</p>
          <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-bold ${
            estimate.verified
              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              : estimate.label === "estimated"
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                : "bg-muted/10 text-muted"
          }`}>
            {estimate.verified ? "Verificado" : estimate.label === "estimated" ? "Estimación" : "Orientativo"}
          </span>
        </div>
      ))}
    </div>
  );
}

function CoverResults({ covers }: { covers: CoverResearchResult }) {
  if (covers.candidates.length === 0) {
    return <p className="py-8 text-sm text-muted">No se han encontrado candidatos de portada en esta consulta.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {covers.candidates.map((candidate) => (
        <article key={candidate.id} className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="aspect-[3/4] bg-muted/10">
            {/* External candidates are deliberately rendered directly; none is persisted by this panel. */}
            <img src={candidate.imageUrl} alt={candidate.title ?? `Candidato de ${candidate.sourceLabel}`} className="h-full w-full object-contain" loading="lazy" />
          </div>
          <div className="space-y-2 border-t border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-foreground">{candidate.sourceLabel}</p>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                candidate.persistence === "temporary_only"
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                  : "bg-sky-500/15 text-sky-800 dark:text-sky-200"
              }`}>
                {candidate.persistence === "temporary_only" ? "Temporal" : "Revisar"}
              </span>
            </div>
            <p className="line-clamp-2 min-h-10 text-sm text-muted">{candidate.title ?? "Sin título de origen"}</p>
            <p className="text-[11px] font-semibold uppercase text-muted">{ASSET_LABELS[candidate.assetKind]}</p>
            {candidate.regionMatch === "other_variant" && (
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">Variante: {candidate.suggestedRegion ?? "otra región"}</p>
            )}
            {candidate.sourcePageUrl && (
              <a href={candidate.sourcePageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                Abrir fuente <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function ListingResults({ listings }: { listings: EbayResearchListing[] }) {
  if (listings.length === 0) return <p className="py-8 text-sm text-muted">eBay no devolvió anuncios utilizables.</p>;
  return (
    <div className="divide-y divide-border">
      {listings.map((listing) => (
        <article key={listing.itemId} className="grid gap-3 py-4 sm:grid-cols-[64px_1fr_auto] sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/10">
            {listing.imageUrls[0] ? (
              <img src={listing.imageUrls[0]} alt="" className="h-full w-full object-contain" loading="lazy" />
            ) : (
              <ImageIcon size={22} className="text-muted" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{listing.title}</p>
            <p className="mt-1 text-xs text-muted">{listing.reasons.join(" · ")}</p>
            {listing.decision === "other_variant" && (
              <p className="mt-1 text-xs font-semibold text-sky-700 dark:text-sky-300">Asignable a {listing.suggestedRegion ?? "otra variante regional"}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
            {listing.totalPrice != null && listing.currency && (
              <p className="font-bold text-foreground">{money(listing.totalPrice, listing.currency)}</p>
            )}
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${decisionClass(listing.decision)}`}>
              {DECISION_LABELS[listing.decision]}
            </span>
            {listing.url && (
              <a href={listing.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
                Ver anuncio <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminMarketResearchPanel({ catalogId }: Props) {
  const [view, setView] = useState<View>("prices");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runResearch() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/catalog/${encodeURIComponent(catalogId)}/market-research`, { method: "POST" });
      const payload = await response.json() as ApiResponse;
      if (!response.ok || !payload.ebay || !payload.covers) {
        setError(payload.error ?? "No se pudo completar el análisis.");
        return;
      }
      setData(payload);
    } catch {
      setError("Error de red durante el análisis.");
    } finally {
      setLoading(false);
    }
  }

  const warnings = [...(data?.ebay?.warnings ?? []), ...(data?.covers?.warnings ?? [])];

  return (
    <Panel className={adminToneClass("search")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <PanelTitle>Mercado y portadas</PanelTitle>
          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <ShieldCheck size={15} aria-hidden="true" />
            Consulta de solo lectura
          </div>
        </div>
        <button
          type="button"
          onClick={runResearch}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}
          {loading ? "Analizando" : data ? "Actualizar análisis" : "Analizar eBay y portadas"}
        </button>
      </div>

      {error && <p className="mt-5 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm font-semibold text-red-800 dark:text-red-200">{error}</p>}

      {data?.ebay && data.covers && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="border-l-2 border-emerald-500 px-3"><p className="text-2xl font-bold">{data.ebay.counts.accept}</p><p className="text-xs text-muted">Esta variante</p></div>
            <div className="border-l-2 border-amber-500 px-3"><p className="text-2xl font-bold">{data.ebay.counts.review}</p><p className="text-xs text-muted">Por revisar</p></div>
            <div className="border-l-2 border-sky-500 px-3"><p className="text-2xl font-bold">{data.ebay.counts.other_variant}</p><p className="text-xs text-muted">Otra variante</p></div>
            <div className="border-l-2 border-border px-3"><p className="text-2xl font-bold">{data.ebay.counts.reject}</p><p className="text-xs text-muted">No válidos</p></div>
            <div className="border-l-2 border-accent px-3"><p className="text-2xl font-bold">{data.covers.candidates.length}</p><p className="text-xs text-muted">Portadas candidatas</p></div>
          </div>

          {(data.ebay.target.gtins.length > 0 || data.ebay.identifierCandidates.epids.length > 0) && (
            <p className="mt-4 text-xs text-muted">
              EAN: {data.ebay.target.gtins.join(", ") || "—"}
              {data.ebay.identifierCandidates.epids.length > 0
                ? ` · ePID candidato: ${data.ebay.identifierCandidates.epids.map((entry) => entry.value).join(", ")}`
                : ""}
            </p>
          )}

          <div className="mt-6 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Resultados del análisis">
            <TabButton active={view === "prices"} onClick={() => setView("prices")}>Precios actuales</TabButton>
            <TabButton active={view === "covers"} onClick={() => setView("covers")}>Portadas</TabButton>
            <TabButton active={view === "listings"} onClick={() => setView("listings")}>Anuncios</TabButton>
          </div>

          <div className="pt-2">
            {view === "prices" && <PriceResults ebay={data.ebay} />}
            {view === "covers" && <CoverResults covers={data.covers} />}
            {view === "listings" && <ListingResults listings={data.ebay.listings} />}
          </div>

          {warnings.length > 0 && (
            <details className="mt-5 border-t border-border pt-4">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                <AlertTriangle size={16} aria-hidden="true" /> Avisos de la consulta ({warnings.length})
              </summary>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </Panel>
  );
}

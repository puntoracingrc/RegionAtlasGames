"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocateFixed, MapPin, X } from "lucide-react";
import { BackLink } from "@/components/breadcrumbs";
import type { MarketplaceListingClientView } from "@/lib/marketplace-types";
import { PHOTO_SLOT_LABELS, REQUIRED_PHOTO_SLOTS } from "@/lib/marketplace-types";
import { formatEur, formatEurCents } from "@/lib/price-format";
import { coverAspectClass, LISTING_PHOTOS_GRID_CLASS } from "@/lib/cover-aspect";
import { cn } from "@/lib/cn";
import { conditionScoreOutOfTen, LISTING_STATUS_HINTS, listingStatusLabel } from "@/lib/marketplace-ui";
import {
  listingAnalysisHasVerifiedEstimate,
  listingAnalysisIsVerified,
  listingVerificationLabel,
} from "@/lib/marketplace-verification";
import { SiteNav } from "@/components/site-nav";
import { Panel, PanelTitle } from "@/components/ui";

type Props = {
  listing: MarketplaceListingClientView;
  isOwner: boolean;
  quotaRemaining: number;
  catalogHref: string;
};

export function ListingManageClient({ listing, isOwner, quotaRemaining, catalogHref }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(listing);
  const [customTitle, setCustomTitle] = useState(listing.customTitle ?? "");
  const [customDescription, setCustomDescription] = useState(listing.customDescription ?? "");
  const [sellerCity, setSellerCity] = useState(listing.sellerCity ?? "");
  const [askingPriceEur, setAskingPriceEur] = useState(
    listing.askingPriceEur != null ? String(listing.askingPriceEur) : "",
  );
  const [sellerLocation, setSellerLocation] = useState(listing.sellerLocation ?? null);
  const [saleOptions, setSaleOptions] = useState(
    listing.saleOptions ?? { pickup: true, shipping: true },
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  async function upload(slot: string, file: File) {
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("slot", slot);
    form.append("file", file);
    const res = await fetch(`/api/marketplace/listings/${current.id}/photos`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Error al subir foto.");
      return;
    }
    if (data.listing) setCurrent(data.listing);
    setSuccess("Foto guardada. La comprobación anterior se ha reiniciado.");
    router.refresh();
  }

  async function publish() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/marketplace/listings/${current.id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "publish" }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo publicar.");
      return;
    }
    if (data.listing) setCurrent(data.listing);
    router.refresh();
  }

  async function runAnalyze() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/marketplace/listings/${current.id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Error en análisis.");
      return;
    }
    if (data.listing) setCurrent(data.listing);
    router.refresh();
  }

  async function saveDetails() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/marketplace/listings/${current.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customTitle,
        customDescription,
        sellerCity,
        askingPriceEur,
        sellerLocation,
        saleOptions,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar el anuncio.");
      return;
    }
    if (data.listing) {
      setCurrent(data.listing);
      setSellerLocation(data.listing.sellerLocation ?? null);
      setAskingPriceEur(
        data.listing.askingPriceEur != null ? String(data.listing.askingPriceEur) : "",
      );
    }
    setSuccess("Anuncio actualizado.");
    router.refresh();
  }

  function useApproximateLocation() {
    setError(null);
    setSuccess(null);
    if (!navigator.geolocation) {
      setError("Este navegador no permite obtener la ubicación.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSellerLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          precision: "approximate",
        });
        setLocating(false);
        setSuccess("Ubicación preparada. Guarda los detalles para aplicarla.");
      },
      () => {
        setLocating(false);
        setError("No se ha podido obtener la ubicación. Puedes seguir usando solo la ciudad.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 15 * 60 * 1000 },
    );
  }

  async function startChat() {
    setLoading(true);
    const res = await fetch("/api/marketplace/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: current.id }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar chat.");
      return;
    }
    router.push(`/chat/${data.conversation.id}`);
  }

  async function cancelListing() {
    if (!confirm("¿Retirar este anuncio del mercado?")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/marketplace/listings/${current.id}/cancel`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo cancelar.");
      return;
    }
    if (data.listing) setCurrent(data.listing);
    router.refresh();
  }

  const missing = REQUIRED_PHOTO_SLOTS.filter(
    (slot) => !current.photos.some((p) => p.slot === slot),
  );
  const verificationPassed = listingAnalysisIsVerified(current.aiAnalysis);
  const hasVerifiedEstimate = listingAnalysisHasVerifiedEstimate(current.aiAnalysis);

  return (
    <>
      <SiteNav sticky={false} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
        <BackLink href={catalogHref}>Volver al juego</BackLink>

        <header className="mt-4 mb-6 space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{current.title}</h1>
          <p className="text-sm text-muted">
            Vendedor: {current.sellerName}
            {current.sellerCity ? ` · ${current.sellerCity}` : ""}
            {" · "}
            {current.region}
            {current.sealed ? " · Precintado" : ""}
          </p>
          <p className="text-xs text-muted">
            {(current.saleOptions?.pickup ?? true) && "Trato en mano"}
            {(current.saleOptions?.pickup ?? true) && (current.saleOptions?.shipping ?? true) ? " · " : ""}
            {(current.saleOptions?.shipping ?? true) && "Envío"}
          </p>
          {current.askingPriceEur != null && current.status !== "sold" ? (
            <p className="text-2xl font-bold tabular-nums text-foreground">
              {formatEurCents(current.askingPriceEur)}
            </p>
          ) : null}
          <p className="text-sm">
            <span className="font-medium text-accent">{listingStatusLabel(current.status)}</span>
            <span className="text-muted"> — {LISTING_STATUS_HINTS[current.status]}</span>
          </p>
          {isOwner && current.status === "draft" && current.publishedAt && (
            <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              Has cambiado una foto: el anuncio volvió a borrador. Vuelve a analizar y publicar.
            </p>
          )}
        </header>

        {isOwner && (current.status === "draft" || current.status === "active") && (
          <p className="mb-4 text-xs text-muted">
            <Link href="/mis-anuncios" className="text-accent hover:underline">
              ← Todos mis anuncios
            </Link>
            {" · "}
            <Link href="/mensajes" className="text-accent hover:underline">
              Mensajes
            </Link>
          </p>
        )}

        <section className={cn("mb-6", LISTING_PHOTOS_GRID_CLASS)}>
          {Object.entries(PHOTO_SLOT_LABELS).map(([slot, label]) => {
            const photo = current.photos.find((p) => p.slot === slot);
            const required = REQUIRED_PHOTO_SLOTS.includes(slot as (typeof REQUIRED_PHOTO_SLOTS)[number]);
            const isDetail = slot.startsWith("media-") || slot.startsWith("detail-");
            const aspect = isDetail ? "aspect-square" : coverAspectClass(current.platformSlug);
            return (
              <Panel key={slot}>
                <p className="text-xs font-medium text-foreground">
                  {label}
                  {required ? " · obligatoria" : " · opcional"}
                </p>
                {photo ? (
                  <div
                    className={cn(
                      "relative mt-2 max-h-36 overflow-hidden rounded-lg bg-black/30 sm:max-h-40",
                      aspect,
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={label} className="h-full w-full object-contain p-0.5" />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Sin foto</p>
                )}
                {isOwner && current.status !== "sold" && (
                  <label className="mt-2 block cursor-pointer text-xs text-accent hover:underline">
                    {photo ? "Reemplazar" : "Subir"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={loading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(slot, f);
                      }}
                    />
                  </label>
                )}
              </Panel>
            );
          })}
        </section>

        {isOwner && (
          <p className="mb-6 text-sm leading-6 text-muted">
            Para publicar solo exigimos dos fotos distintas: portada y contraportada. Puedes añadir
            disco, cartucho, manual o detalles de desgaste cuando aporten información útil.
          </p>
        )}

        {current.aiAnalysis && (
          <Panel className="mb-6">
            <PanelTitle>Comprobación del anuncio</PanelTitle>
            <p className={cn(
              "border-l-2 px-3 py-2 text-sm font-semibold",
              verificationPassed
                ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500 text-amber-800 dark:text-amber-200",
            )}>
              {listingVerificationLabel(current.aiAnalysis)}
            </p>
            {hasVerifiedEstimate ? (
              <>
                <div className="mt-4"><ConditionMeter score={current.aiAnalysis.conditionScore} /></div>
                <p className="mt-3 text-sm text-foreground">{current.aiAnalysis.conditionVerdict}</p>
                <p className="mt-2 text-lg font-bold text-accent">
                  Estimación: {formatEur(current.aiAnalysis.estimatedPriceEur)}
                </p>
              </>
            ) : null}
            {current.aiAnalysis.visualDescription && (
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {current.aiAnalysis.visualDescription}
              </p>
            )}
            {current.aiAnalysis.gameMatchVerdict && (
              <p className="mt-2 text-xs text-muted">
                Coincidencia: {current.aiAnalysis.gameMatchVerdict}
              </p>
            )}
            {current.aiAnalysis.conditionIssues && current.aiAnalysis.conditionIssues.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                {current.aiAnalysis.conditionIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            {current.aiAnalysis.verificationReasons && current.aiAnalysis.verificationReasons.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                {current.aiAnalysis.verificationReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted">{current.aiAnalysis.notes}</p>
          </Panel>
        )}

        {isOwner && (current.status === "draft" || current.status === "active") && (
          <Panel className="mb-6">
            <PanelTitle>Detalles del anuncio</PanelTitle>
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Título personalizado
                </span>
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="input"
                  placeholder={current.title}
                  maxLength={120}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Precio de venta
                </span>
                <div className="relative max-w-48">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="100000"
                    step="0.01"
                    value={askingPriceEur}
                    onChange={(event) => setAskingPriceEur(event.target.value)}
                    className="input pr-9 tabular-nums"
                    required
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
                    €
                  </span>
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Descripción del vendedor
                </span>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  className="input min-h-28 resize-y"
                  maxLength={1200}
                  placeholder="Ej. Caja con señales leves, disco probado, envío protegido..."
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-muted">
                  Ciudad
                </span>
                <input
                  value={sellerCity}
                  onChange={(e) => setSellerCity(e.target.value)}
                  className="input"
                  placeholder="Ej. Madrid"
                />
              </label>
              <div className="space-y-2">
                <span className="block text-xs font-medium uppercase tracking-wider text-muted">
                  Ubicación aproximada · opcional
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-secondary inline-flex items-center gap-2 text-sm"
                    disabled={loading || locating}
                    onClick={useApproximateLocation}
                  >
                    <LocateFixed size={16} aria-hidden="true" />
                    {locating ? "Localizando…" : sellerLocation ? "Actualizar zona" : "Añadir zona"}
                  </button>
                  {sellerLocation ? (
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted transition hover:text-foreground"
                      title="Quitar ubicación aproximada"
                      aria-label="Quitar ubicación aproximada"
                      onClick={() => setSellerLocation(null)}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                    <MapPin size={14} aria-hidden="true" />
                    {sellerLocation ? "Zona añadida" : "Solo se mostrará la ciudad"}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  La posición se redondea a una zona de unos 10 km antes de guardarse.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={saleOptions.pickup}
                    onChange={(e) => setSaleOptions((prev) => ({ ...prev, pickup: e.target.checked }))}
                  />
                  Trato en mano
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-foreground">
                  <input
                    type="checkbox"
                    checked={saleOptions.shipping}
                    onChange={(e) => setSaleOptions((prev) => ({ ...prev, shipping: e.target.checked }))}
                  />
                  Envío
                </label>
              </div>
              <button type="button" className="btn-secondary" disabled={loading} onClick={saveDetails}>
                Guardar detalles
              </button>
            </div>
          </Panel>
        )}

        {!isOwner && (current.customDescription || current.sellerCity) && (
          <Panel className="mb-6">
            <PanelTitle>Información del vendedor</PanelTitle>
            {current.customDescription && (
              <p className="text-sm leading-relaxed text-foreground">{current.customDescription}</p>
            )}
            <p className="mt-3 text-xs text-muted">
              {current.sellerCity ? `Ciudad: ${current.sellerCity}` : "Ciudad no indicada"}
            </p>
          </Panel>
        )}

        {error && (
          <p className="mb-4 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
            {error}
          </p>
        )}
        {success && (
          <p className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-200">
            {success}
          </p>
        )}

        {isOwner ? (
          <div className="flex flex-wrap gap-2">
            {(current.status === "draft" || current.status === "active") && (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loading || missing.length > 0}
                  onClick={runAnalyze}
                >
                  Comprobar fotos ({quotaRemaining} restantes)
                </button>
                {current.status === "draft" ? (
                  <button
                    type="button"
                    className="btn-primary disabled:cursor-not-allowed disabled:saturate-0"
                    disabled={loading || !verificationPassed || missing.length > 0}
                    onClick={publish}
                  >
                    Publicar anuncio
                  </button>
                ) : (
                  <span className="inline-flex items-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Anuncio publicado
                  </span>
                )}
                <button
                  type="button"
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:border-rose-400/40 hover:text-rose-300"
                  disabled={loading}
                  onClick={cancelListing}
                >
                  Retirar anuncio
                </button>
              </>
            )}
            {current.status === "sold" && (
              <Link href="/mensajes" className="btn-secondary">
                Ver conversaciones
              </Link>
            )}
          </div>
        ) : (
          current.status === "active" && (
            <button type="button" className="btn-primary" disabled={loading} onClick={startChat}>
              Iniciar conversación
            </button>
          )
        )}
      </main>
    </>
  );
}

function ConditionMeter({ score }: { score: number }) {
  const value = conditionScoreOutOfTen(score) ?? 1;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-muted">Estado estimado</span>
        <span className="font-semibold text-foreground">{value}/10</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-card-hover">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );
}

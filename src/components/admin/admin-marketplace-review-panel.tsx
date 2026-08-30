"use client";

import { CheckCircle2, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import type {
  ManualListingReviewCriterion,
  MarketplaceListingClientView,
} from "@/lib/marketplace-types";
import {
  MANUAL_LISTING_REVIEW_CRITERIA,
  PHOTO_SLOT_LABELS,
} from "@/lib/marketplace-types";
import { listingVerificationLabel } from "@/lib/marketplace-verification";
import { Badge, Panel, PanelTitle } from "@/components/ui";

type Props = { initialListings: MarketplaceListingClientView[] };

const MANUAL_REVIEW_LABELS: Record<ManualListingReviewCriterion, string> = {
  distinct_photos: "Portada y contraportada son fotos distintas y se leen con claridad.",
  game_and_platform: "El juego y la plataforma coinciden con la ficha del catálogo.",
  region_evidence: "La contraportada, clasificación o código confirman la región indicada.",
};

export function AdminMarketplaceReviewPanel({ initialListings }: Props) {
  const [listings, setListings] = useState(initialListings);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [criteriaByListing, setCriteriaByListing] = useState<
    Record<string, Partial<Record<ManualListingReviewCriterion, boolean>>>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(listingId: string, action: "approve" | "reject") {
    setBusyId(listingId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/marketplace/listings/${listingId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          note: notes[listingId] ?? "",
          criteria: MANUAL_LISTING_REVIEW_CRITERIA.filter(
            (criterion) => criteriaByListing[listingId]?.[criterion],
          ),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar la revisión.");
      setListings((current) => current.filter((listing) => listing.id !== listingId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la revisión.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelTitle eyebrow="Compraventa">Anuncios que necesitan una decisión</PanelTitle>
        <Badge tone={listings.length > 0 ? "amber" : "green"}>
          {listings.length} pendientes
        </Badge>
      </div>

      {error ? (
        <p className="mb-4 border-l-2 border-rose-500 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      {listings.length === 0 ? (
        <p className="text-sm text-muted">No hay anuncios pendientes de revisión.</p>
      ) : (
        <div className="divide-y divide-border">
          {listings.map((listing) => {
            const selectedCriteria = criteriaByListing[listing.id] ?? {};
            const approvalReady = MANUAL_LISTING_REVIEW_CRITERIA.every(
              (criterion) => selectedCriteria[criterion],
            );
            return (
            <article key={listing.id} className="py-6 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">{listing.title}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {listing.platformSlug.toUpperCase()} · {listing.region} · {listing.sellerName}
                  </p>
                </div>
                <Badge tone="amber">{listingVerificationLabel(listing.aiAnalysis)}</Badge>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {listing.photos.map((photo) => (
                  <figure key={photo.slot} className="min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={`${PHOTO_SLOT_LABELS[photo.slot]} de ${listing.title}`}
                      className="aspect-[4/3] w-full rounded-md border border-border bg-black/10 object-contain"
                    />
                    <figcaption className="mt-1 text-xs text-muted">
                      {PHOTO_SLOT_LABELS[photo.slot]}
                    </figcaption>
                  </figure>
                ))}
              </div>

              {listing.aiAnalysis?.verificationReasons?.length ? (
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
                  {listing.aiAnalysis.verificationReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted">
                  Anuncio anterior al nuevo sistema de evidencias; comprueba las fotos antes de mantenerlo activo.
                </p>
              )}

              <fieldset className="mt-4 max-w-2xl rounded-md border border-border p-3">
                <legend className="px-1 text-xs font-semibold text-foreground">
                  Criterios obligatorios para aprobar
                </legend>
                <div className="space-y-2">
                  {MANUAL_LISTING_REVIEW_CRITERIA.map((criterion) => (
                    <label key={criterion} className="flex items-start gap-2 text-sm text-muted">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={Boolean(selectedCriteria[criterion])}
                        onChange={(event) => setCriteriaByListing((current) => ({
                          ...current,
                          [listing.id]: {
                            ...current[listing.id],
                            [criterion]: event.target.checked,
                          },
                        }))}
                      />
                      <span>{MANUAL_REVIEW_LABELS[criterion]}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Si no puedes confirmar los tres puntos, pide nuevas fotos.
                </p>
              </fieldset>

              <label className="mt-4 block max-w-2xl space-y-1.5">
                <span className="text-xs font-medium text-muted">Nota para la decisión</span>
                <input
                  className="input"
                  value={notes[listing.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({
                    ...current,
                    [listing.id]: event.target.value,
                  }))}
                  maxLength={500}
                  placeholder="Ej. Contraportada española y fotos distintas"
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:saturate-0"
                  disabled={busyId !== null || !approvalReady}
                  onClick={() => review(listing.id, "approve")}
                >
                  {busyId === listing.id
                    ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                    : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                  Aprobar y publicar
                </button>
                <button
                  type="button"
                  className="btn-secondary inline-flex items-center gap-2"
                  disabled={busyId !== null}
                  onClick={() => review(listing.id, "reject")}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Pedir nuevas fotos
                </button>
              </div>
            </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

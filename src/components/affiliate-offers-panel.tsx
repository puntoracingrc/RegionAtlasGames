"use client";

import { useEffect, useState } from "react";
import {
  affiliateConditionLabel,
  affiliateOfferLocation,
  affiliateShippingLabel,
  formatAffiliateMoney,
} from "@/lib/affiliate-offer-presentation";
import { AffiliateDisclosure } from "./affiliate/affiliate-disclosure";
import { Badge, Panel, PanelTitle } from "./ui";
import type { AffiliateFallbackCta, AffiliateOffer } from "@/lib/affiliate-offers";

type AffiliateOffersResponse = {
  enabled: boolean;
  offers: AffiliateOffer[];
  fallbackCta: AffiliateFallbackCta | null;
  fallbackCtas?: AffiliateFallbackCta[];
  trackingId: string | null;
  ebayImpressionPixelUrl: string | null;
  error?: string;
};

type Props = {
  catalogId: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: AffiliateOffersResponse }
  | { status: "error" };

function providerLabel(provider: AffiliateOffer["provider"]): string {
  if (provider === "ebay") return "eBay";
  if (provider === "amazon") return "Amazon";
  if (provider === "rakuten") return "Rakuten";
  if (provider === "mock") return "Mock";
  return "Oferta";
}

function fallbackProviderLabel(provider: AffiliateFallbackCta["provider"]): string {
  if (provider === "amazon") return "Amazon";
  return "eBay";
}

export function AffiliateOffersPanel({ catalogId }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    fetch(`/api/catalog/offers/${encodeURIComponent(catalogId)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as AffiliateOffersResponse;
      })
      .then((data) => {
        setState({ status: "ready", data });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        void error;
        setState({ status: "error" });
      });

    return () => controller.abort();
  }, [catalogId]);

  if (state.status === "loading") {
    return (
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelTitle eyebrow="Ofertas externas">Dónde comprar</PanelTitle>
          <Badge tone="neutral">Cargando</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          Buscando ofertas externas sin bloquear la ficha del juego…
        </p>
      </Panel>
    );
  }

  if (state.status === "error") {
    return (
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelTitle eyebrow="Ofertas externas">Dónde comprar</PanelTitle>
          <Badge tone="neutral">No disponible</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          No se han podido cargar ofertas externas ahora mismo. La ficha sigue disponible con normalidad.
        </p>
      </Panel>
    );
  }

  const { offers, fallbackCta, fallbackCtas, ebayImpressionPixelUrl, error } = state.data;
  const searchFallbacks = fallbackCtas?.length ? fallbackCtas : fallbackCta ? [fallbackCta] : [];
  const primaryFallbackLabel = fallbackCta ? fallbackCta.label : null;
  if (offers.length === 0 && searchFallbacks.length === 0 && error) {
    return (
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelTitle eyebrow="Ofertas externas">Dónde comprar</PanelTitle>
          <Badge tone="neutral">No disponible</Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-muted">
          No se han podido cargar ofertas externas ahora mismo. La ficha sigue disponible con normalidad.
        </p>
      </Panel>
    );
  }

  if (offers.length === 0 && searchFallbacks.length === 0) return null;

  return (
    <Panel>
      {ebayImpressionPixelUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ebayImpressionPixelUrl}
          alt=""
          aria-hidden="true"
          width={1}
          height={1}
          className="pointer-events-none absolute h-px w-px opacity-0"
          loading="eager"
        />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PanelTitle eyebrow="Ofertas externas">Dónde comprar</PanelTitle>
        <Badge tone="neutral">Enlaces afiliados</Badge>
      </div>
      <div className="mb-4 mt-3">
        <AffiliateDisclosure />
      </div>
      {offers.length > 0 ? (
        <>
          <p className="mb-4 text-sm leading-6 text-muted">
            Ofertas activas encontradas automáticamente. Los precios externos pueden cambiar y deben confirmarse en la
            tienda antes de comprar.
          </p>
          <div className="grid gap-3">
            {offers.map((offer) => {
              const location = affiliateOfferLocation(offer.location);
              const condition = affiliateConditionLabel(offer.condition);
              return (
                <a
                  key={`${offer.provider}-${offer.id}`}
                  href={offer.url}
                  target="_blank"
                  rel="sponsored nofollow noopener noreferrer"
                  className="group rounded-lg border border-border bg-background/45 p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card-hover"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white p-1">
                      {offer.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={offer.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
                      ) : (
                        <span className="text-xs text-muted">{providerLabel(offer.provider)}</span>
                      )}
                    </div>
                    <div className="min-w-0 text-right">
                      <Badge tone={offer.provider === "ebay" ? "violet" : "amber"}>
                        {providerLabel(offer.provider)}
                      </Badge>
                      <p className="mt-3 text-[10px] font-semibold uppercase text-muted">Precio</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">
                        {formatAffiliateMoney(offer.price, offer.currency)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        {affiliateShippingLabel(offer.shippingPrice, offer.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="break-words text-sm font-semibold leading-5 text-foreground group-hover:text-accent">
                      {offer.title}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted">
                      <span>{condition ?? "Estado no indicado"}</span>
                      {location ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-foreground/75">
                          {location.flag ? (
                            <span aria-hidden="true" className="text-base leading-none">
                              {location.flag}
                            </span>
                          ) : null}
                          <span>{location.label}</span>
                        </span>
                      ) : (
                        <span>Ubicación no indicada</span>
                      )}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </>
      ) : null}
      {searchFallbacks.length > 0 ? (
        <div className={`${offers.length > 0 ? "mt-4 " : ""}rounded-2xl border border-border bg-background/45 p-4`}>
          <p className="text-sm leading-6 text-muted">
            {offers.length > 0
              ? "También puedes abrir una búsqueda afiliada específica para este juego."
              : "No hay listings válidos para mostrar ahora mismo. Puedes abrir una búsqueda afiliada en una tienda externa."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {searchFallbacks.map((fallback) => (
              <a
                key={fallback.id}
                href={fallback.url}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                className="inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-90"
              >
                {fallback.label || primaryFallbackLabel || `Buscar en ${fallbackProviderLabel(fallback.provider)}`}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

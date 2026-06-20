"use client";

import { useEffect, useState } from "react";
import { formatEur } from "@/lib/price-format";
import { AffiliateDisclosure } from "./affiliate/affiliate-disclosure";
import { Badge, Panel, PanelTitle } from "./ui";
import type { AffiliateFallbackCta, AffiliateOffer } from "@/lib/affiliate-offers";

type AffiliateOffersResponse = {
  enabled: boolean;
  offers: AffiliateOffer[];
  fallbackCta: AffiliateFallbackCta | null;
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

function priceLabel(offer: AffiliateOffer): string {
  if (offer.currency === "EUR") {
    return offer.price != null ? formatEur(offer.price) : "Ver precio";
  }
  return offer.price != null ? `${offer.price.toFixed(2)} ${offer.currency}` : "Ver precio";
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

  const { offers, fallbackCta, ebayImpressionPixelUrl, error } = state.data;
  if (offers.length === 0 && !fallbackCta && error) {
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

  if (offers.length === 0 && !fallbackCta) return null;

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
          <div className="grid gap-3 sm:grid-cols-2">
            {offers.map((offer) => (
              <a
                key={`${offer.provider}-${offer.id}`}
                href={offer.url}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                className="group grid grid-cols-[72px_1fr] gap-3 rounded-2xl border border-border bg-background/45 p-3 transition hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card-hover"
              >
                <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
                  {offer.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={offer.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="text-xs text-muted">{providerLabel(offer.provider)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={offer.provider === "ebay" ? "violet" : "amber"}>
                      {providerLabel(offer.provider)}
                    </Badge>
                    {offer.condition ? <span className="text-[11px] text-muted">{offer.condition}</span> : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-foreground group-hover:text-accent">
                    {offer.title}
                  </p>
                  <p className="mt-2 text-base font-bold text-foreground">{priceLabel(offer)}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {offer.shippingPrice != null ? `Envío ${formatEur(offer.shippingPrice)}` : "Ver envío"}
                    {offer.location ? ` · ${offer.location}` : ""}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </>
      ) : fallbackCta ? (
        <div className="rounded-2xl border border-border bg-background/45 p-4">
          <p className="text-sm leading-6 text-muted">
            No hay listings válidos de Browse API para mostrar ahora mismo.
          </p>
          <a
            href={fallbackCta.url}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            className="mt-3 inline-flex rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-90"
          >
            {fallbackCta.label}
          </a>
        </div>
      ) : null}
    </Panel>
  );
}

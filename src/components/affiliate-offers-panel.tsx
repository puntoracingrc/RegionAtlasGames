import { formatEur } from "@/lib/price-format";
import { getEbayAffiliateImpressionPixelUrl, type AffiliateFallbackCta, type AffiliateOffer } from "@/lib/affiliate-offers";
import { AffiliateDisclosure } from "./affiliate/affiliate-disclosure";
import { Badge, Panel, PanelTitle } from "./ui";

type Props = {
  offers: AffiliateOffer[];
  fallbackCta?: AffiliateFallbackCta | null;
  trackingId?: string | null;
};

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

export function AffiliateOffersPanel({ offers, fallbackCta, trackingId }: Props) {
  if (offers.length === 0 && !fallbackCta) return null;
  const hasEbayLink = offers.some((offer) => offer.provider === "ebay") || fallbackCta?.provider === "ebay";
  const ebayImpressionPixelUrl = hasEbayLink
    ? getEbayAffiliateImpressionPixelUrl(trackingId ?? undefined)
    : null;

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

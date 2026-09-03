"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CircleUserRound,
  ExternalLink,
  LoaderCircle,
  MapPin,
  ReceiptEuro,
} from "lucide-react";
import {
  affiliateConditionLabel,
  affiliateOfferLocation,
  affiliateShippingLabel,
  formatAffiliateMoney,
} from "@/lib/affiliate-offer-presentation";
import type { AffiliateFallbackCta, AffiliateOffer } from "@/lib/affiliate-offers";
import {
  offerDistanceKm,
  sortCatalogOffers,
  type CatalogOfferSortMode,
  type OfferCoordinates,
} from "@/lib/catalog-offer-sort";
import { AFFILIATE_DISCLOSURE_COMPACT_TEXT } from "@/lib/affiliate/disclosure";
import type { ApproximateListingLocation, ListingSaleOptions } from "@/lib/marketplace-types";
import { formatEurCents } from "@/lib/price-format";

export type MarketplaceCatalogOffer = {
  id: string;
  title: string;
  sellerName: string;
  sellerCity: string | null;
  photoUrl: string | null;
  askingPriceEur: number | null;
  conditionLabel: string;
  publishedAt: string | null;
  saleOptions: ListingSaleOptions;
  sellerLocation: ApproximateListingLocation | null;
};

type Props = {
  catalogId: string;
  marketplaceOffers: MarketplaceCatalogOffer[];
  canContact: boolean;
};

type AffiliateOffersResponse = {
  enabled: boolean;
  offers: AffiliateOffer[];
  fallbackCta: AffiliateFallbackCta | null;
  fallbackCtas?: AffiliateFallbackCta[];
  ebayImpressionPixelUrl: string | null;
};

type AffiliateState =
  | { status: "loading" }
  | { status: "ready"; data: AffiliateOffersResponse }
  | { status: "error" };

type UnifiedOffer = {
  id: string;
  source: "marketplace" | "affiliate";
  priceEur: number | null;
  listedAt: string | null;
  location: OfferCoordinates | null;
  isInternational: boolean;
  marketplace?: MarketplaceCatalogOffer;
  affiliate?: AffiliateOffer;
};

function providerLabel(provider: AffiliateOffer["provider"] | AffiliateFallbackCta["provider"]): string {
  if (provider === "ebay") return "eBay";
  if (provider === "amazon") return "Amazon";
  if (provider === "rakuten") return "Rakuten";
  return "Tienda";
}

function affiliateSortPrice(offer: AffiliateOffer): number | null {
  return offer.price;
}

function offerDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function distanceLabel(distance: number): string {
  if (distance < 10) return `~${distance.toFixed(1)} km`;
  return `~${Math.round(distance)} km`;
}

export function CatalogOffersList({ catalogId, marketplaceOffers, canContact }: Props) {
  const [affiliateState, setAffiliateState] = useState<AffiliateState>({ status: "loading" });
  const [sortMode, setSortMode] = useState<CatalogOfferSortMode>("price");
  const [buyerLocation, setBuyerLocation] = useState<OfferCoordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "denied">("idle");
  const [showAllOnSmallScreens, setShowAllOnSmallScreens] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/catalog/offers/${encodeURIComponent(catalogId)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as AffiliateOffersResponse;
      })
      .then((data) => setAffiliateState({ status: "ready", data }))
      .catch(() => {
        if (!controller.signal.aborted) setAffiliateState({ status: "error" });
      });
    return () => controller.abort();
  }, [catalogId]);

  const affiliateOffers = useMemo(
    () => (affiliateState.status === "ready" ? affiliateState.data.offers : []),
    [affiliateState],
  );
  const unifiedOffers = useMemo<UnifiedOffer[]>(() => {
    const userRows = marketplaceOffers.map((offer) => ({
      id: `marketplace-${offer.id}`,
      source: "marketplace" as const,
      priceEur: offer.askingPriceEur,
      listedAt: offer.publishedAt,
      location: offer.sellerLocation,
      isInternational: false,
      marketplace: offer,
    }));
    const affiliateRows = affiliateOffers.map((offer) => {
      const location = affiliateOfferLocation(offer.location);
      const isInternational =
        offer.marketScope === "international" ||
        (offer.provider === "ebay" && offer.marketScope !== "spain" && Boolean(location?.code && location.code !== "ES"));
      return {
        id: `${offer.provider}-${offer.id}`,
        source: "affiliate" as const,
        priceEur: affiliateSortPrice(offer),
        listedAt: offer.listedAt ?? null,
        location: null,
        isInternational,
        affiliate: offer,
      };
    });
    const sorted = sortCatalogOffers([...userRows, ...affiliateRows], sortMode, buyerLocation);
    return [
      ...sorted.filter((offer) => !offer.isInternational),
      ...sorted.filter((offer) => offer.isInternational),
    ];
  }, [affiliateOffers, buyerLocation, marketplaceOffers, sortMode]);
  const firstInternationalOfferIndex = unifiedOffers.findIndex((offer) => offer.isInternational);

  const fallbackCtas =
    affiliateState.status === "ready"
      ? affiliateState.data.fallbackCtas?.length
        ? affiliateState.data.fallbackCtas
        : affiliateState.data.fallbackCta
          ? [affiliateState.data.fallbackCta]
          : []
      : [];
  const hasAffiliateLinks = affiliateOffers.length > 0 || fallbackCtas.length > 0;

  function selectDistanceSort() {
    setSortMode("distance");
    if (buyerLocation || locationStatus === "loading") return;
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setBuyerLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("idle");
      },
      () => setLocationStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60 * 1000 },
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border/80 bg-card/90 shadow-sm shadow-black/5 dark:shadow-black/20">
      {affiliateState.status === "ready" && affiliateState.data.ebayImpressionPixelUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={affiliateState.data.ebayImpressionPixelUrl}
          alt=""
          aria-hidden="true"
          width={1}
          height={1}
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Ofertas disponibles</h2>
          <p className="mt-0.5 text-xs text-muted">
            {marketplaceOffers.length} de usuarios
            {affiliateState.status === "ready" ? ` · ${affiliateOffers.length} externas` : ""}
          </p>
        </div>
        <div
          className="inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-background/50 p-0.5"
          role="group"
          aria-label="Ordenar ofertas"
        >
          <SortButton
            active={sortMode === "price"}
            label="Precio"
            icon={<ReceiptEuro size={14} aria-hidden="true" />}
            onClick={() => setSortMode("price")}
          />
          <SortButton
            active={sortMode === "date"}
            label="Fecha"
            icon={<CalendarDays size={14} aria-hidden="true" />}
            onClick={() => setSortMode("date")}
          />
          <SortButton
            active={sortMode === "distance"}
            label="Distancia"
            icon={
              locationStatus === "loading" ? (
                <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />
              ) : (
                <MapPin size={14} aria-hidden="true" />
              )
            }
            onClick={selectDistanceSort}
          />
        </div>
      </div>

      {sortMode === "distance" && locationStatus === "denied" ? (
        <p className="border-b border-border bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          No se ha compartido tu ubicación. Se mantiene el orden por fecha.
        </p>
      ) : null}
      {sortMode === "distance" && buyerLocation ? (
        <p className="border-b border-border px-3 py-2 text-xs text-muted">
          Distancias aproximadas. Tu ubicación se usa solo en este dispositivo y no se guarda.
        </p>
      ) : null}

      <ul className="divide-y divide-border/80">
        {unifiedOffers.map((offer, index) => {
          const responsiveClass = !showAllOnSmallScreens && index >= 3 ? "hidden lg:list-item" : undefined;
          return (
            <Fragment key={offer.id}>
              {index === firstInternationalOfferIndex ? (
                <li className={responsiveClass}>
                  <div className="flex items-center justify-between gap-3 bg-background/35 px-3 py-2 text-[11px] font-semibold text-muted">
                    <span>Fuera de España</span>
                    <span className="font-normal">Con envío a España</span>
                  </div>
                </li>
              ) : null}
              {offer.source === "marketplace" && offer.marketplace ? (
                <MarketplaceOfferRow
                  offer={offer.marketplace}
                  canContact={canContact}
                  className={responsiveClass}
                  distance={
                    buyerLocation && offer.location
                      ? offerDistanceKm(buyerLocation, offer.location)
                      : null
                  }
                />
              ) : offer.affiliate ? (
                <AffiliateOfferRow offer={offer.affiliate} className={responsiveClass} />
              ) : null}
            </Fragment>
          );
        })}
        {unifiedOffers.length > 3 ? (
          <li className="lg:hidden">
            <button
              type="button"
              className="w-full px-3 py-2.5 text-center text-xs font-semibold text-accent transition hover:bg-card-hover"
              onClick={() => setShowAllOnSmallScreens((visible) => !visible)}
            >
              {showAllOnSmallScreens ? "Mostrar menos" : `Ver las ${unifiedOffers.length} ofertas`}
            </button>
          </li>
        ) : null}
        {affiliateState.status === "loading" ? (
          <li className="flex min-h-20 items-center gap-3 px-3 py-3 text-sm text-muted">
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            Buscando anuncios de eBay…
          </li>
        ) : null}
        {unifiedOffers.length === 0 && affiliateState.status !== "loading" ? (
          <li className="px-3 py-5 text-sm text-muted">No hay anuncios disponibles ahora mismo.</li>
        ) : null}
        {fallbackCtas.map((fallback) => (
          <li key={fallback.id} className="px-3 py-3">
              <div className="flex justify-center">
              <a
                href={fallback.url}
                target="_blank"
                rel="sponsored nofollow noopener noreferrer"
                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-center text-sm font-bold transition sm:w-auto ${
                  fallback.provider === "amazon"
                    ? "bg-amber-400 text-slate-950 shadow-sm shadow-amber-950/15 hover:bg-amber-300"
                    : "bg-accent text-accent-fg hover:opacity-90"
                }`}
              >
                <span>{fallback.label || `Buscar en ${providerLabel(fallback.provider)}`}</span>
                <ExternalLink size={16} className="shrink-0" aria-hidden="true" />
              </a>
            </div>
          </li>
        ))}
      </ul>

      {affiliateState.status === "error" ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted">eBay no está disponible ahora mismo.</p>
      ) : null}
      {hasAffiliateLinks ? (
        <p className="border-t border-border px-3 py-2 text-[11px] leading-5 text-muted">
          {AFFILIATE_DISCLOSURE_COMPACT_TEXT}{" "}
          <Link href="/affiliate-disclosure" className="font-semibold text-accent hover:underline">
            Información
          </Link>
        </p>
      ) : null}
    </section>
  );
}

function SortButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
        active ? "bg-accent text-accent-fg" : "text-muted hover:bg-card-hover hover:text-foreground"
      }`}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function MarketplaceOfferRow({
  offer,
  canContact,
  distance,
  className,
}: {
  offer: MarketplaceCatalogOffer;
  canContact: boolean;
  distance: number | null;
  className?: string;
}) {
  const href = canContact ? `/venta/${offer.id}` : "/login";
  const date = offerDateLabel(offer.publishedAt);
  return (
    <li className={className}>
      <Link
        href={href}
        className="grid min-h-24 grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition hover:bg-card-hover"
      >
        <div className="flex h-16 w-12 items-center justify-center overflow-hidden rounded-md border border-border bg-background/60">
          {offer.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <CircleUserRound size={20} className="text-muted" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              Usuario
            </span>
            <span className="truncate text-xs font-semibold text-foreground">{offer.sellerName}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm font-medium text-foreground">{offer.title}</p>
          <p className="mt-1 line-clamp-1 text-xs text-muted">
            {[offer.conditionLabel, offer.sellerCity, distance != null ? distanceLabel(distance) : null, date]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            {offer.saleOptions.pickup ? "Trato en mano" : ""}
            {offer.saleOptions.pickup && offer.saleOptions.shipping ? " · " : ""}
            {offer.saleOptions.shipping ? "Envío" : ""}
          </p>
        </div>
        <div className="min-w-16 text-right">
          <p className="text-lg font-bold tabular-nums text-foreground">
            {offer.askingPriceEur == null ? "—" : formatEurCents(offer.askingPriceEur)}
          </p>
          <p className="mt-1 text-[10px] font-medium text-accent">
            {canContact ? "Contactar" : "Entrar"}
          </p>
        </div>
      </Link>
    </li>
  );
}

function AffiliateOfferRow({ offer, className }: { offer: AffiliateOffer; className?: string }) {
  const location = affiliateOfferLocation(offer.location);
  const condition = affiliateConditionLabel(offer.condition);
  const date = offerDateLabel(offer.listedAt ?? null);
  return (
    <li className={className}>
      <a
        href={offer.url}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        className="grid min-h-24 grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 transition hover:bg-card-hover"
      >
        <div className="flex h-16 w-14 items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1">
          {offer.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={offer.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
          ) : (
            <ExternalLink size={18} className="text-muted" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:text-violet-300">
              {providerLabel(offer.provider)}
            </span>
            {condition ? <span className="text-xs text-muted">{condition}</span> : null}
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-foreground">{offer.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            {location?.flag ? <span aria-hidden="true">{location.flag}</span> : null}
            {location?.label ? <span>{location.label}</span> : null}
            {location?.label && date ? <span>·</span> : null}
            {date ? <span>{date}</span> : null}
          </p>
        </div>
        <div className="min-w-20 text-right">
          <p className="text-lg font-bold tabular-nums text-foreground">
            {formatAffiliateMoney(offer.price, offer.currency)}
          </p>
          <p className="mt-1 max-w-24 text-[10px] leading-4 text-muted">
            {affiliateShippingLabel(offer.shippingPrice, offer.currency)}
          </p>
        </div>
      </a>
    </li>
  );
}

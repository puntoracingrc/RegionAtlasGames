"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  Handshake,
  Images,
  MapPin,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Truck,
  X,
} from "lucide-react";
import { RegionFlag } from "@/components/region-flag";
import {
  affiliateOfferLocation,
  affiliateShippingLabel,
  formatAffiliateMoney,
} from "@/lib/affiliate-offer-presentation";
import type { AffiliateOffer } from "@/lib/affiliate-offers";
import { AFFILIATE_DISCLOSURE_COMPACT_TEXT } from "@/lib/affiliate/disclosure";
import { cn } from "@/lib/cn";
import { formatEurCents } from "@/lib/price-format";
import {
  DEFAULT_VITRINA_FILTERS,
  VITRINA_CONDITION_LABELS,
  filterAndSortVitrinaListings,
  hasActiveVitrinaFilters,
  vitrinaFiltersToSearchParams,
  type VitrinaFilters,
  type VitrinaListing,
} from "@/lib/vitrina-marketplace";

type Props = {
  listings: VitrinaListing[];
  initialFilters: VitrinaFilters;
};

type AffiliateOffersResponse = {
  offers?: AffiliateOffer[];
  ebayImpressionPixelUrl?: string | null;
};

type SponsoredOffer = AffiliateOffer & { catalogId: string };

function uniqueOptions(values: Array<{ value: string; label: string }>) {
  return [...new Map(values.map((option) => [option.value, option])).values()]
    .sort((left, right) => left.label.localeCompare(right.label, "es"));
}

function dateLabel(value: string | null): string {
  if (!value) return "Fecha no indicada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no indicada";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(date);
}

function priceInput(value: number | null): string {
  return value == null ? "" : String(value);
}

function parsedPrice(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function VitrinaMarketplace({ listings, initialFilters }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [minPriceDraft, setMinPriceDraft] = useState(priceInput(initialFilters.minPrice));
  const [maxPriceDraft, setMaxPriceDraft] = useState(priceInput(initialFilters.maxPrice));
  const [filterOpen, setFilterOpen] = useState(false);
  const [sponsoredOffers, setSponsoredOffers] = useState<SponsoredOffer[]>([]);
  const [impressionPixels, setImpressionPixels] = useState<string[]>([]);

  const visibleListings = useMemo(
    () => filterAndSortVitrinaListings(listings, filters),
    [filters, listings],
  );
  const platformOptions = useMemo(
    () => uniqueOptions(listings.map((listing) => ({
      value: listing.platformSlug,
      label: listing.platformName,
    }))),
    [listings],
  );
  const regionOptions = useMemo(
    () => uniqueOptions(listings
      .filter((listing) => filters.platform === "all" || listing.platformSlug === filters.platform)
      .map((listing) => ({ value: listing.region, label: listing.regionLabel }))),
    [filters.platform, listings],
  );
  const relatedCatalogIds = useMemo(
    () => [...new Set(visibleListings.map((listing) => listing.catalogId))].slice(0, 4),
    [visibleListings],
  );
  const relatedCatalogKey = relatedCatalogIds.join("|");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const params = vitrinaFiltersToSearchParams(filters);
      const query = params.toString();
      window.history.replaceState(null, "", query ? `/vitrina?${query}` : "/vitrina");
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [filters]);

  useEffect(() => {
    document.body.style.overflow = filterOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [filterOpen]);

  useEffect(() => {
    const controller = new AbortController();
    const catalogIds = relatedCatalogKey ? relatedCatalogKey.split("|") : [];
    if (visibleListings.length < 2 || catalogIds.length === 0) {
      const timeout = window.setTimeout(() => {
        setSponsoredOffers([]);
        setImpressionPixels([]);
      }, 0);
      return () => {
        controller.abort();
        window.clearTimeout(timeout);
      };
    }

    const timeout = window.setTimeout(() => {
      Promise.all(catalogIds.map(async (catalogId) => {
        const response = await fetch(`/api/catalog/offers/${encodeURIComponent(catalogId)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return { catalogId, offers: [], pixel: null };
        const data = await response.json() as AffiliateOffersResponse;
        return {
          catalogId,
          offers: (data.offers ?? []).filter((offer) => offer.provider === "ebay"),
          pixel: data.ebayImpressionPixelUrl ?? null,
        };
      }))
        .then((blocks) => {
          const seen = new Set<string>();
          const limit = Math.min(3, Math.max(1, Math.ceil(visibleListings.length / 7)));
          const offers = blocks.flatMap((block) => block.offers.map((offer) => ({
            ...offer,
            catalogId: block.catalogId,
          }))).filter((offer) => {
            if (seen.has(offer.id)) return false;
            seen.add(offer.id);
            return true;
          }).slice(0, limit);
          setSponsoredOffers(offers);
          setImpressionPixels(blocks.flatMap((block) => block.pixel ? [block.pixel] : []));
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSponsoredOffers([]);
            setImpressionPixels([]);
          }
        });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [relatedCatalogKey, visibleListings.length]);

  function setFilter<K extends keyof VitrinaFilters>(key: K, value: VitrinaFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters({ ...DEFAULT_VITRINA_FILTERS });
    setMinPriceDraft("");
    setMaxPriceDraft("");
  }

  const gridItems: Array<
    | { kind: "listing"; listing: VitrinaListing }
    | { kind: "sponsored"; offer: SponsoredOffer }
  > = [];
  const shortInsertAt = visibleListings.length < 7 ? Math.ceil(visibleListings.length / 2) : -1;
  let sponsoredIndex = 0;
  visibleListings.forEach((listing, index) => {
    gridItems.push({ kind: "listing", listing });
    const position = index + 1;
    const insert = sponsoredIndex < sponsoredOffers.length
      && (position % 6 === 0 || position === shortInsertAt);
    if (insert) {
      gridItems.push({ kind: "sponsored", offer: sponsoredOffers[sponsoredIndex] });
      sponsoredIndex += 1;
    }
  });

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 md:px-6 md:py-7">
      {impressionPixels.map((pixel) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={pixel} src={pixel} alt="" aria-hidden className="absolute h-px w-px opacity-0" />
      ))}

      <header className="mb-5 border-b border-border pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-accent">Mercado entre coleccionistas</p>
            <h1 className="mt-1 text-3xl font-bold text-foreground">Vitrina</h1>
            <p className="mt-1 text-sm text-muted">Juegos físicos publicados por usuarios de Region Atlas.</p>
          </div>
          <p className="text-sm text-muted">
            <strong className="text-foreground">{visibleListings.length}</strong>
            {visibleListings.length === 1 ? " anuncio" : " anuncios"}
          </p>
        </div>
      </header>

      <div className="mb-4 flex gap-2 lg:hidden">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground"
          onClick={() => setFilterOpen(true)}
        >
          <SlidersHorizontal size={17} aria-hidden />
          Filtros
        </button>
        {hasActiveVitrinaFilters(filters) ? (
          <button type="button" className="h-10 rounded-lg px-3 text-sm font-medium text-accent" onClick={resetFilters}>
            Limpiar
          </button>
        ) : null}
      </div>

      {filterOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Cerrar filtros"
          onClick={() => setFilterOpen(false)}
        />
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[min(88vw,320px)] overflow-y-auto border-r border-border bg-background p-4 shadow-xl transition-transform lg:sticky lg:top-20 lg:z-auto lg:block lg:w-auto lg:translate-x-0 lg:rounded-lg lg:border lg:bg-card lg:p-4 lg:shadow-sm",
            filterOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-label="Filtros de Vitrina"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-foreground">Filtros</h2>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted lg:hidden"
              aria-label="Cerrar filtros"
              onClick={() => setFilterOpen(false)}
            >
              <X size={18} aria-hidden />
            </button>
          </div>

          <div className="space-y-4">
            <FilterSelect
              label="Plataforma"
              value={filters.platform}
              onChange={(value) => setFilter("platform", value)}
              options={[{ value: "all", label: "Todas las plataformas" }, ...platformOptions]}
            />
            <FilterSelect
              label="Región"
              value={filters.region}
              onChange={(value) => setFilter("region", value)}
              options={[{ value: "all", label: "Todas las regiones" }, ...regionOptions]}
            />
            <FilterSelect
              label="Estado"
              value={filters.condition}
              onChange={(value) => setFilter("condition", value as VitrinaFilters["condition"])}
              options={[
                { value: "all", label: "Todos los estados" },
                ...Object.entries(VITRINA_CONDITION_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
            <FilterSelect
              label="Entrega"
              value={filters.delivery}
              onChange={(value) => setFilter("delivery", value as VitrinaFilters["delivery"])}
              options={[
                { value: "all", label: "Cualquier entrega" },
                { value: "shipping", label: "Con envío" },
                { value: "pickup", label: "Trato en mano" },
              ]}
            />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">Ciudad</span>
              <div className="relative">
                <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input
                  value={filters.city}
                  onChange={(event) => setFilter("city", event.target.value)}
                  className="input h-10 pl-9 text-sm"
                  placeholder="Cualquier ciudad"
                />
              </div>
            </label>
            <fieldset>
              <legend className="mb-1.5 text-xs font-semibold text-muted">Precio</legend>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="sr-only">Precio mínimo</span>
                  <input
                    inputMode="decimal"
                    value={minPriceDraft}
                    onChange={(event) => {
                      setMinPriceDraft(event.target.value);
                      setFilter("minPrice", parsedPrice(event.target.value));
                    }}
                    className="input h-10 text-sm"
                    placeholder="Desde €"
                  />
                </label>
                <label>
                  <span className="sr-only">Precio máximo</span>
                  <input
                    inputMode="decimal"
                    value={maxPriceDraft}
                    onChange={(event) => {
                      setMaxPriceDraft(event.target.value);
                      setFilter("maxPrice", parsedPrice(event.target.value));
                    }}
                    className="input h-10 text-sm"
                    placeholder="Hasta €"
                  />
                </label>
              </div>
            </fieldset>
          </div>

          {hasActiveVitrinaFilters(filters) ? (
            <button
              type="button"
              className="mt-5 w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-card-hover"
              onClick={resetFilters}
            >
              Limpiar filtros
            </button>
          ) : null}
        </aside>

        <section aria-label="Anuncios en Vitrina">
          <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative block">
              <span className="sr-only">Buscar juegos en venta</span>
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={filters.query}
                onChange={(event) => setFilter("query", event.target.value)}
                className="input h-11 pl-10 text-sm"
                placeholder="Buscar juego, plataforma o región"
              />
            </label>
            <FilterSelect
              label="Orden"
              hideLabel
              value={filters.sort}
              onChange={(value) => setFilter("sort", value as VitrinaFilters["sort"])}
              options={[
                { value: "recent", label: "Más recientes" },
                { value: "price-asc", label: "Precio: menor primero" },
                { value: "price-desc", label: "Precio: mayor primero" },
              ]}
            />
          </div>

          {gridItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {gridItems.map((item) => item.kind === "listing" ? (
                <VitrinaListingCard key={`listing-${item.listing.id}`} listing={item.listing} />
              ) : (
                <SponsoredCard key={`sponsored-${item.offer.id}`} offer={item.offer} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card px-5 py-12 text-center">
              <p className="font-semibold text-foreground">No hay anuncios que coincidan.</p>
              {hasActiveVitrinaFilters(filters) ? (
                <button type="button" className="mt-3 text-sm font-semibold text-accent" onClick={resetFilters}>
                  Limpiar filtros
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function FilterSelect({
  label,
  hideLabel = false,
  value,
  options,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className={hideLabel ? "sr-only" : "mb-1.5 block text-xs font-semibold text-muted"}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="input h-11 text-sm">
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function VitrinaListingCard({ listing }: { listing: VitrinaListing }) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:border-accent/40 hover:shadow-md">
      <Link href={listing.catalogHref} className="group relative block aspect-[3/4] overflow-hidden bg-background/70">
        {listing.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.coverUrl}
            alt={listing.title}
            className={cn("h-full w-full", listing.usesSellerPhoto ? "object-cover" : "object-contain p-2")}
            loading="lazy"
          />
        ) : (
          <span className="flex h-full items-center justify-center px-3 text-center text-xs text-muted">Sin imagen</span>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
          {listing.conditionLabel}
        </span>
        {listing.photoCount > 1 ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
            <Images size={12} aria-hidden /> {listing.photoCount}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <p className="text-xl font-bold tabular-nums text-foreground">
          {listing.askingPriceEur == null ? "Precio pendiente" : formatEurCents(listing.askingPriceEur)}
        </p>
        <Link href={listing.catalogHref} className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground hover:text-accent">
          {listing.title}
        </Link>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <span className="font-semibold text-foreground/80">{listing.platformName}</span>
          <span>·</span>
          <RegionFlag region={listing.region} showLabel labelMode="short" />
        </div>
        <p className="mt-2 truncate text-xs text-muted">
          {listing.sellerCity || "Ubicación no indicada"} · {dateLabel(listing.publishedAt)}
        </p>
        <p className="mt-1 truncate text-[11px] text-muted">Vende {listing.sellerName}</p>
        <div className="mt-2 flex min-h-5 flex-wrap gap-x-2 text-[11px] text-muted">
          {listing.shipping ? <span className="inline-flex items-center gap-1"><Truck size={12} aria-hidden /> Envío</span> : null}
          {listing.pickup ? <span className="inline-flex items-center gap-1"><Handshake size={12} aria-hidden /> En mano</span> : null}
        </div>
        <div className="mt-auto border-t border-border pt-3">
          <Link
            href={listing.contactHref}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-fg transition hover:opacity-90"
          >
            <MessageCircle size={15} aria-hidden />
            Contactar
          </Link>
        </div>
      </div>
    </article>
  );
}

function SponsoredCard({ offer }: { offer: SponsoredOffer }) {
  const location = affiliateOfferLocation(offer.location);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-violet-400/35 bg-card shadow-sm">
      <a
        href={offer.url}
        target="_blank"
        rel="sponsored nofollow noopener noreferrer"
        className="group relative block aspect-[3/4] overflow-hidden bg-white"
      >
        {offer.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.imageUrl} alt="" className="h-full w-full object-contain p-2" loading="lazy" />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-muted">eBay</span>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-violet-700 px-2 py-1 text-[10px] font-semibold text-white">
          Publicidad · eBay
        </span>
      </a>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-xl font-bold tabular-nums text-foreground">
          {formatAffiliateMoney(offer.price, offer.currency)}
        </p>
        <a
          href={offer.url}
          target="_blank"
          rel="sponsored nofollow noopener noreferrer"
          className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-foreground hover:text-accent"
        >
          {offer.title}
        </a>
        <p className="mt-2 truncate text-xs text-muted">
          {location?.label || "Ubicación no indicada"}
        </p>
        <p className="mt-1 min-h-5 text-[11px] text-muted">
          {affiliateShippingLabel(offer.shippingPrice, offer.currency)}
        </p>
        <p className="mt-2 text-[10px] leading-4 text-muted">{AFFILIATE_DISCLOSURE_COMPACT_TEXT}</p>
        <div className="mt-auto border-t border-border pt-3">
          <a
            href={offer.url}
            target="_blank"
            rel="sponsored nofollow noopener noreferrer"
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-violet-400/40 px-3 text-xs font-semibold text-violet-700 transition hover:bg-violet-500/10 dark:text-violet-300"
          >
            Ver en eBay <ExternalLink size={14} aria-hidden />
          </a>
        </div>
      </div>
    </article>
  );
}

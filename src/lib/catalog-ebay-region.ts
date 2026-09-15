import {
  catalogMarketRegionToLegacyRegion,
  isCatalogMarketRegion,
  type CatalogMarketRegion,
  type CatalogPhysicalEdition,
} from "@/lib/catalog-edition-guide-types";
import { catalogGamePath } from "@/lib/catalog-path";
import { getRegionDisplay } from "@/lib/region-display";
import type { CatalogListGame } from "@/lib/types";

export const CATALOG_EBAY_REGION_PARAM = "ebayRegion";

export type CatalogEbayRegionOption = {
  value: CatalogMarketRegion;
  label: string;
  region: string;
  catalogId?: string;
  physicalEditionId: string;
};

const marketNames = new Intl.DisplayNames(["es"], { type: "region" });

export function catalogEbayRegionOptions(
  editions: CatalogPhysicalEdition[],
): CatalogEbayRegionOption[] {
  const releasedEditions = editions.filter((edition) => edition.releaseStatus === "RELEASED");
  const seen = new Set<CatalogMarketRegion>();
  const options = releasedEditions.flatMap((edition) => edition.marketRegions.flatMap((marketRegion) => {
    if (!isCatalogMarketRegion(marketRegion) || seen.has(marketRegion)) return [];
    seen.add(marketRegion);
    return [{
      value: marketRegion,
      label: marketNames.of(marketRegion) ?? marketRegion,
      region: catalogMarketRegionToLegacyRegion(marketRegion),
      ...(edition.catalogIds[0] ? { catalogId: edition.catalogIds[0] } : {}),
      physicalEditionId: edition.id,
    }];
  }));

  if (seen.has("ES") || releasedEditions.length === 0) return options;

  // España es el mercado de anuncios predeterminado, no evidencia de que la
  // edición se distribuyese allí. Conservamos como referencia la edición actual
  // europea o, si no existe, la primera de la familia.
  const fallbackEdition = releasedEditions.find((edition) => edition.broadRegion === "EUROPE") ?? releasedEditions[0];
  return [{
    value: "ES",
    label: marketNames.of("ES") ?? "España",
    region: catalogMarketRegionToLegacyRegion("ES"),
    ...(fallbackEdition.catalogIds[0] ? { catalogId: fallbackEdition.catalogIds[0] } : {}),
    physicalEditionId: fallbackEdition.id,
  }, ...options];
}

export function resolveCatalogEbayRegion(
  options: CatalogEbayRegionOption[],
  requestedRegion?: string | null,
  currentRegion?: string | null,
): CatalogEbayRegionOption | undefined {
  const requested = requestedRegion?.trim().toUpperCase();
  if (requested && isCatalogMarketRegion(requested)) {
    const match = options.find((option) => option.value === requested);
    if (match) return match;
  }

  const current = currentRegion?.trim().toUpperCase();
  if (current && isCatalogMarketRegion(current)) {
    const match = options.find((option) => option.value === current);
    if (match) return match;
  }

  return options.find((option) => option.value === "ES") ?? options[0];
}

export function catalogEbayRegionFromFilter(
  activeRegion: string | undefined,
  availableRegions: string[],
): CatalogMarketRegion | undefined {
  if (!activeRegion || activeRegion === "all") return undefined;
  const activeFlag = getRegionDisplay(activeRegion).flagCode;
  return availableRegions.find((marketRegion): marketRegion is CatalogMarketRegion => (
    isCatalogMarketRegion(marketRegion) && (
      marketRegion === activeRegion.toUpperCase() ||
      marketRegion === activeFlag ||
      getRegionDisplay(catalogMarketRegionToLegacyRegion(marketRegion)).label === activeRegion
    )
  ));
}

export function catalogGamePathWithEbayRegion(
  game: Pick<CatalogListGame, "slug" | "platformSlug" | "region" | "canonicalSeoSlug" | "physicalEditionGroup">,
  activeRegion?: string,
): string {
  const path = catalogGamePath(game);
  const marketRegion = catalogEbayRegionFromFilter(
    activeRegion,
    game.physicalEditionGroup?.marketRegions ?? [],
  );
  return marketRegion
    ? `${path}?${CATALOG_EBAY_REGION_PARAM}=${encodeURIComponent(marketRegion)}`
    : path;
}

export function catalogEbayOfferCacheKey(catalogId: string, marketRegion?: string | null): string {
  return `${catalogId}:ebay:${marketRegion?.trim().toUpperCase() || "default"}`;
}

export function catalogPathWithRequestedEbayRegion(
  path: string,
  requestedRegion?: string | null,
): string {
  const region = requestedRegion?.trim().toUpperCase();
  return region && isCatalogMarketRegion(region)
    ? `${path}?${CATALOG_EBAY_REGION_PARAM}=${encodeURIComponent(region)}`
    : path;
}

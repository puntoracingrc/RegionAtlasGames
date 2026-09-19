import {
  CATALOG_MARKET_REGION_META,
  isCatalogMarketRegion,
  type CatalogBroadRegion,
  type CatalogMarketRegion,
  type CatalogPhysicalVariantConfidence,
} from "./catalog-edition-guide-types";
import { slugify } from "./slug";
import type { CatalogPhysicalReleaseGroup } from "./types";
import type { AdminInitialPriceFields } from "./admin-draft-types";

export const GENERIC_MARKET_VALUES = ["EU_GENERIC", "ASIA_GENERIC"] as const;
export type GenericMarketValue = (typeof GENERIC_MARKET_VALUES)[number];
export type AdminMarketValue = CatalogMarketRegion | GenericMarketValue;

export type AdminRegionalVariantGroupInput = {
  label?: string;
  markets: string[];
  barcode?: string | null;
  productCodes?: string[];
  packagingLanguages?: string[];
  softwareLanguages?: string[];
  confidence?: CatalogPhysicalVariantConfidence;
  coverUrl?: string | null;
  ratingSystems?: string[];
  catalogNumber?: string | null;
  serial?: string | null;
  boxCode?: string | null;
  releaseDate?: string | null;
  releaseDateContext?: string | null;
  physicalContentStatus?: CatalogPhysicalReleaseGroup["physicalContentStatus"];
  physicalProductType?: CatalogPhysicalReleaseGroup["physicalProductType"];
  dimensions?: CatalogPhysicalReleaseGroup["dimensions"];
  physicalContents?: string[];
  digitalContents?: string[];
  images?: CatalogPhysicalReleaseGroup["images"];
  notes?: string[];
  marketPrices?: Record<string, AdminInitialPriceFields | undefined>;
};

export type AdminRegionalVariantBatchInput = {
  title: string;
  platformSlug: string;
  baseSlug?: string;
  physicalVariant?: string | null;
  groups: AdminRegionalVariantGroupInput[];
};

export type ExpandedRegionalVariantRow = {
  market: AdminMarketValue;
  marketRegion: CatalogMarketRegion | null;
  region: string;
  slug: string;
  group: CatalogPhysicalReleaseGroup;
  initialPrices: AdminInitialPriceFields | null;
};

export const ADMIN_MARKET_GROUPS = [
  { id: "europe", label: "Europa" },
  { id: "america", label: "América" },
  { id: "asia", label: "Asia" },
  { id: "oceania", label: "Oceanía" },
  { id: "middle-east", label: "Oriente Medio" },
  { id: "africa", label: "África" },
] as const;

export function adminMarketOptions() {
  const exact = Object.entries(CATALOG_MARKET_REGION_META).map(([value, meta]) => ({
    value: value as CatalogMarketRegion,
    label: `${meta.shortLabel} · ${meta.country}`,
    shortLabel: meta.shortLabel,
    flagCode: meta.flagCode,
    group: meta.navigationGroup,
    broadRegion: meta.broadRegion,
  }));
  return [
    ...exact,
    {
      value: "EU_GENERIC" as const,
      label: "EU · Europa internacional",
      shortLabel: "EU",
      flagCode: "EU",
      group: "europe" as const,
      broadRegion: "EUROPE" as const,
    },
    {
      value: "ASIA_GENERIC" as const,
      label: "ASIA · Asia internacional",
      shortLabel: "ASIA",
      flagCode: "INT",
      group: "asia" as const,
      broadRegion: "ASIA" as const,
    },
  ];
}

function genericMarket(value: GenericMarketValue) {
  return value === "EU_GENERIC"
    ? { region: "PAL Europa", broadRegion: "EUROPE" as const, shortLabel: "EU" }
    : { region: "Asia", broadRegion: "ASIA" as const, shortLabel: "ASIA" };
}

function marketData(value: string): {
  value: AdminMarketValue;
  region: string;
  broadRegion: CatalogBroadRegion;
  shortLabel: string;
  marketRegion: CatalogMarketRegion | null;
} | null {
  if (isCatalogMarketRegion(value)) {
    const meta = CATALOG_MARKET_REGION_META[value];
    return {
      value,
      region: meta.legacyRegion,
      broadRegion: meta.broadRegion,
      shortLabel: meta.shortLabel,
      marketRegion: value,
    };
  }
  if (value === "EU_GENERIC" || value === "ASIA_GENERIC") {
    const generic = genericMarket(value);
    return { value, ...generic, marketRegion: null };
  }
  return null;
}

function cleanList(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function validInitialPrices(prices: AdminInitialPriceFields | undefined): boolean {
  return Object.values(prices ?? {}).every((value) => value == null || (Number.isFinite(value) && value >= 0));
}

export function expandRegionalVariantBatch(
  input: AdminRegionalVariantBatchInput,
): { rows: ExpandedRegionalVariantRow[]; physicalVariantCount: number } | { error: string } {
  const title = input.title.trim();
  const platformSlug = input.platformSlug.trim();
  if (!title) return { error: "Falta el título." };
  if (!platformSlug) return { error: "Falta la plataforma." };
  if (!Array.isArray(input.groups) || input.groups.length === 0) {
    return { error: "Añade al menos una variante física." };
  }

  const baseSlug = slugify(input.baseSlug?.trim() || title);
  const rows: ExpandedRegionalVariantRow[] = [];
  const usedSlugs = new Set<string>();
  const usedMarkets = new Set<string>();

  for (const [index, rawGroup] of input.groups.entries()) {
    const markets = [...new Set(rawGroup.markets ?? [])].map(marketData);
    if (markets.some((market) => !market)) {
      return { error: `La variante ${index + 1} contiene una región no válida.` };
    }
    const resolvedMarkets = markets.filter((market): market is NonNullable<typeof market> => Boolean(market));
    if (resolvedMarkets.length === 0) {
      return { error: `Selecciona al menos una región en la variante ${index + 1}.` };
    }
    if (resolvedMarkets.some((market) => market.marketRegion === null) && resolvedMarkets.length > 1) {
      return { error: "Europa/Asia internacional debe usarse como variante independiente." };
    }
    if (new Set(resolvedMarkets.map((market) => market.broadRegion)).size > 1) {
      return { error: `La variante ${index + 1} mezcla grandes regiones distintas.` };
    }
    const repeatedMarket = resolvedMarkets.find((market) => usedMarkets.has(market.value));
    if (repeatedMarket) {
      return { error: `La región ${repeatedMarket.shortLabel} está seleccionada en más de una variante.` };
    }
    resolvedMarkets.forEach((market) => usedMarkets.add(market.value));
    const invalidPriceMarket = resolvedMarkets.find((market) => !validInitialPrices(rawGroup.marketPrices?.[market.value]));
    if (invalidPriceMarket) {
      return { error: `La variante ${index + 1} contiene un precio no válido para ${invalidPriceMarket.shortLabel}.` };
    }

    const regionLabel = resolvedMarkets.map((market) => market.shortLabel).join("/");
    const groupLabel = rawGroup.label?.trim() || regionLabel;
    const groupKey = `${String(index + 1).padStart(2, "0")}-${slugify(groupLabel) || "variante"}`;
    const group: CatalogPhysicalReleaseGroup = {
      id: `${platformSlug}:${baseSlug}:${slugify(input.physicalVariant || "standard")}:${groupKey}`,
      label: groupLabel,
      barcode: rawGroup.barcode?.trim() || null,
      productCodes: cleanList(rawGroup.productCodes),
      packagingLanguages: cleanList(rawGroup.packagingLanguages).map((value) => value.toUpperCase()),
      softwareLanguages: cleanList(rawGroup.softwareLanguages).map((value) => value.toUpperCase()),
      confidence: rawGroup.confidence ?? (rawGroup.barcode?.trim() ? "CONFIRMED" : "PENDING_IDENTIFIER"),
      coverUrl: rawGroup.coverUrl?.trim() || null,
      ratingSystems: cleanList(rawGroup.ratingSystems),
      catalogNumber: rawGroup.catalogNumber?.trim() || null,
      serial: rawGroup.serial?.trim() || null,
      boxCode: rawGroup.boxCode?.trim() || null,
      releaseDate: rawGroup.releaseDate?.trim() || null,
      releaseDateContext: rawGroup.releaseDateContext?.trim() || null,
      physicalContentStatus: rawGroup.physicalContentStatus,
      physicalProductType: rawGroup.physicalProductType,
      dimensions: rawGroup.dimensions,
      physicalContents: cleanList(rawGroup.physicalContents),
      digitalContents: cleanList(rawGroup.digitalContents),
      images: rawGroup.images ?? [],
      notes: cleanList(rawGroup.notes),
    };

    for (const market of resolvedMarkets) {
      const marketSlug = slugify(market.shortLabel);
      let slug = `${baseSlug}-${marketSlug}`;
      if (usedSlugs.has(slug)) slug = `${slug}-${slugify(groupLabel) || index + 1}`;
      usedSlugs.add(slug);
      rows.push({
        market: market.value,
        marketRegion: market.marketRegion,
        region: market.region,
        slug,
        group,
        initialPrices: rawGroup.marketPrices?.[market.value] ?? null,
      });
    }
  }

  return { rows, physicalVariantCount: input.groups.length };
}

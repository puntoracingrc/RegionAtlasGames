import {
  CATALOG_MARKET_REGION_META,
  isCatalogMarketRegion,
  type CatalogBroadRegion,
  type CatalogMarketRegion,
  type CatalogPhysicalVariantConfidence,
} from "./catalog-edition-guide-types";
import { slugify } from "./slug";
import { catalogIdFromStaging } from "./pc-path-guess";
import { decodeCatalogDisplayText } from "./catalog-presentation";
import type { CatalogPhysicalReleaseGroup } from "./types";
import type { CatalogGame } from "./types";
import type { AdminInitialPriceFields } from "./admin-draft-types";

export const GENERIC_MARKET_VALUES = ["EU_GENERIC", "ASIA_GENERIC"] as const;
export type GenericMarketValue = (typeof GENERIC_MARKET_VALUES)[number];
export type AdminMarketValue = CatalogMarketRegion | GenericMarketValue;

export type AdminRegionalVariantGroupInput = {
  label?: string;
  regionalTitle?: string;
  physicalVariant?: string | null;
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
  existingCatalogIds?: Record<string, string | undefined>;
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
  physicalVariant: string | null;
  group: CatalogPhysicalReleaseGroup;
  initialPrices: AdminInitialPriceFields | null;
  existingCatalogId: string | null;
  /** Null preserves the title of a linked catalog entry. */
  regionalTitle: string | null;
};

export function selectRegionalVariantBatchRow(
  rows: ExpandedRegionalVariantRow[],
  rowIndex: number | undefined,
): { row: ExpandedRegionalVariantRow; rowIndex: number } | { error: string } {
  if (rowIndex === undefined && rows.length !== 1) {
    return { error: "El lote contiene varias identidades. Envíalas de una en una con rowIndex." };
  }
  const selected = rowIndex ?? 0;
  if (!Number.isInteger(selected) || selected < 0 || selected >= rows.length) {
    return { error: "rowIndex no válido para este lote." };
  }
  return { row: rows[selected], rowIndex: selected };
}

export function regionalVariantBatchCatalogId(
  platformSlug: string,
  row: ExpandedRegionalVariantRow,
): string {
  return row.existingCatalogId ?? catalogIdFromStaging({
    platformSlug,
    slug: row.slug,
    region: row.region,
  });
}

// Only used to reconcile an uncertain HTTP response. A matching ID alone is
// never enough to treat a previously published game as this batch's result.
export function matchesPublishedRegionalVariantRow(
  game: CatalogGame,
  input: { title: string; platformSlug: string; workId: string; row: ExpandedRegionalVariantRow },
): boolean {
  const { row } = input;
  if (game.id !== regionalVariantBatchCatalogId(input.platformSlug, row)
    || (row.regionalTitle !== null
      && decodeCatalogDisplayText(game.title) !== decodeCatalogDisplayText(row.regionalTitle))
    || game.platformSlug !== input.platformSlug
    || game.workId !== input.workId
    || game.region !== row.region
    || (game.marketRegion ?? null) !== row.marketRegion
    || (game.physicalVariant ?? null) !== row.physicalVariant
    || JSON.stringify(game.physicalReleaseGroup ?? null) !== JSON.stringify(row.group)) {
    return false;
  }
  return Object.entries(row.initialPrices ?? {}).every(([field, value]) =>
    value == null || (game as unknown as Record<string, unknown>)[field] === value);
}

export function classifyRegionalBatchRowPublication(input: {
  indexed: boolean;
  overlayGame: CatalogGame | null;
  staticGame: CatalogGame | null;
  detailsReady: boolean;
  identityMatches: boolean;
}): "MISSING" | "INCOMPLETE" | "CONFLICT" | "MATCHING" {
  if (!input.indexed && !input.overlayGame && !input.staticGame) return "MISSING";
  if (!input.indexed || !input.overlayGame || !input.detailsReady) return "INCOMPLETE";
  return input.identityMatches ? "MATCHING" : "CONFLICT";
}

export function buildAdminVariantImageSlug(input: {
  titleSlug: string;
  platformSlug: string;
  markets: string[];
  groupLabel?: string;
  physicalVariant?: string;
  role: string;
}): string {
  return [
    input.titleSlug,
    input.platformSlug,
    input.markets.join("-"),
    input.groupLabel || input.physicalVariant || "standard",
    input.role,
  ].map(slugify).filter(Boolean).join("-");
}

export function applyExpandedRegionalIdentity<
  T extends { region: string; marketRegion?: string | null },
>(
  draft: T,
  row: Pick<ExpandedRegionalVariantRow, "region" | "marketRegion">,
): Omit<T, "region" | "marketRegion"> & {
  region: string;
  marketRegion: CatalogMarketRegion | null;
} {
  return {
    ...draft,
    region: row.region,
    marketRegion: row.marketRegion,
  };
}

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
  const usedExistingCatalogIds = new Set<string>();

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
    const invalidPriceMarket = resolvedMarkets.find((market) => !validInitialPrices(rawGroup.marketPrices?.[market.value]));
    if (invalidPriceMarket) {
      return { error: `La variante ${index + 1} contiene un precio no válido para ${invalidPriceMarket.shortLabel}.` };
    }

    const regionLabel = resolvedMarkets.map((market) => market.shortLabel).join("/");
    const groupLabel = rawGroup.label?.trim() || regionLabel;
    const physicalVariant = rawGroup.physicalVariant?.trim() || input.physicalVariant?.trim() || null;
    const groupKey = `${String(index + 1).padStart(2, "0")}-${slugify(groupLabel) || "variante"}`;
    const group: CatalogPhysicalReleaseGroup = {
      id: `${platformSlug}:${baseSlug}:${slugify(physicalVariant || "standard")}:${groupKey}`,
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
      const existingCatalogId = rawGroup.existingCatalogIds?.[market.value]?.trim() || null;
      if (existingCatalogId && usedExistingCatalogIds.has(existingCatalogId)) {
        return { error: `La ficha existente ${existingCatalogId} está asignada más de una vez.` };
      }
      if (existingCatalogId) usedExistingCatalogIds.add(existingCatalogId);
      const marketSlug = slugify(market.shortLabel);
      let slug = `${baseSlug}-${marketSlug}`;
      const editionSlug = slugify(rawGroup.label?.trim() || physicalVariant || "") || String(index + 1);
      if (usedSlugs.has(slug)) slug = `${slug}-${editionSlug}`;
      let duplicateIndex = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${marketSlug}-${editionSlug}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      usedSlugs.add(slug);
      rows.push({
        market: market.value,
        marketRegion: market.marketRegion,
        region: market.region,
        slug,
        physicalVariant,
        group,
        initialPrices: rawGroup.marketPrices?.[market.value] ?? null,
        existingCatalogId,
        regionalTitle: rawGroup.regionalTitle?.trim() || (existingCatalogId ? null : title),
      });
    }
  }

  return { rows, physicalVariantCount: input.groups.length };
}

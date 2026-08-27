import type { CatalogGame, GameDetails } from "../types.ts";
import { ebayBrowseApiBase, ebayCatalogApiBase, ebayFetch } from "./ebay-client.ts";
import {
  evaluateEbayResearchMatch,
  parseGameGtins,
  type EbayConditionBucket,
  type EbayResearchDecision,
  type EbayResearchMatch,
  type EbayResearchTarget,
  type EbaySearchBasis,
} from "./ebay-research-match.ts";
import type {
  EbayCatalogProductSummary,
  EbayCatalogSearchResponse,
  EbayItem,
  EbayItemSummary,
  EbaySearchResponse,
} from "./ebay.types.ts";

const MAX_GTIN_STRATEGIES = 2;
const MAX_EPID_STRATEGIES = 3;
const MAX_LISTING_DETAILS = 12;
const REQUEST_TIMEOUT_MS = 8_000;

export type EbayCatalogCandidate = {
  epid: string | null;
  title: string;
  url: string | null;
  imageUrls: string[];
  gtins: string[];
  mpns: string[];
  brand: string | null;
  exactIdentifier: boolean;
  decision: EbayResearchDecision;
  confidence: number;
  reasons: string[];
};

export type EbayResearchListing = {
  itemId: string;
  title: string;
  url: string | null;
  affiliateUrl: string | null;
  imageUrls: string[];
  price: number | null;
  shippingPrice: number | null;
  totalPrice: number | null;
  currency: string | null;
  condition: string | null;
  conditionBucket: EbayConditionBucket;
  decision: EbayResearchDecision;
  confidence: number;
  platformMatch: EbayResearchMatch["platformMatch"];
  regionMatch: EbayResearchMatch["regionMatch"];
  suggestedRegion: string | null;
  exactIdentifier: boolean;
  exactReference: boolean;
  epid: string | null;
  gtin: string | null;
  reasons: string[];
  searchBasis: EbaySearchBasis[];
};

export type EbayConditionEstimate = {
  condition: Exclude<EbayConditionBucket, "unknown">;
  currency: string;
  observations: number;
  minimum: number;
  median: number;
  maximum: number;
  verified: boolean;
  label: "indicative" | "estimated" | "verified";
};

export type EbayResearchReport = {
  generatedAt: string;
  target: {
    catalogId: string;
    title: string;
    platformSlug: string;
    region: string;
    gtins: string[];
    reference: string | null;
    exactEpids: string[];
  };
  catalogCandidates: EbayCatalogCandidate[];
  listings: EbayResearchListing[];
  estimates: EbayConditionEstimate[];
  counts: Record<EbayResearchDecision, number>;
  identifierCandidates: {
    epids: Array<{ value: string; observations: number; confidence: number }>;
  };
  warnings: string[];
};

type CatalogCandidateWithBasis = {
  product: EbayCatalogProductSummary;
  basis: EbaySearchBasis;
};

type BrowseCandidate = {
  summary: EbayItemSummary;
  bases: EbaySearchBasis[];
};

function requestOptions(): RequestInit {
  return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" };
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function uniqueImageUrls(item: Pick<EbayItemSummary, "image" | "additionalImages" | "thumbnailImages">): string[] {
  const values = [
    item.image?.imageUrl,
    ...(item.additionalImages ?? []).map((image) => image.imageUrl),
    ...(item.thumbnailImages ?? []).map((image) => image.imageUrl),
  ];
  return [...new Set(values.map(safeHttpUrl).filter((value): value is string => Boolean(value)))].slice(0, 6);
}

function parseMoney(value: string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function shippingPrice(item: EbayItemSummary): number | null {
  const value = item.shippingOptions?.find((option) => option.shippingCost?.value)?.shippingCost?.value;
  return parseMoney(value);
}

function totalPrice(item: EbayItemSummary): { price: number | null; shipping: number | null; total: number | null } {
  const price = parseMoney(item.price?.value);
  const shipping = shippingPrice(item);
  if (price === null) return { price, shipping, total: null };
  return { price, shipping, total: Math.round((price + (shipping ?? 0)) * 100) / 100 };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return Math.round(value * 100) / 100;
}

export function aggregateEbayListings(listings: EbayResearchListing[]): EbayConditionEstimate[] {
  const groups = new Map<string, { condition: Exclude<EbayConditionBucket, "unknown">; currency: string; values: number[] }>();
  for (const listing of listings) {
    if (listing.decision !== "accept" || listing.conditionBucket === "unknown") continue;
    if (!listing.currency || listing.totalPrice === null || listing.totalPrice <= 0) continue;
    const key = `${listing.conditionBucket}:${listing.currency}`;
    const group = groups.get(key) ?? {
      condition: listing.conditionBucket,
      currency: listing.currency,
      values: [],
    };
    group.values.push(listing.totalPrice);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map(({ condition, currency, values }) => ({
      condition,
      currency,
      observations: values.length,
      minimum: Math.min(...values),
      median: median(values),
      maximum: Math.max(...values),
      verified: values.length >= 3,
      label: values.length >= 3 ? "verified" as const : values.length >= 2 ? "estimated" as const : "indicative" as const,
    }))
    .sort((a, b) => a.condition.localeCompare(b.condition));
}

function researchTarget(game: CatalogGame, details: GameDetails | null, epids: string[] = []): EbayResearchTarget {
  return {
    title: game.title,
    platformSlug: game.platformSlug,
    region: game.region,
    gtins: parseGameGtins(details?.ean),
    epids,
    reference: details?.reference ?? null,
  };
}

function platformQueryLabel(slug: string): string {
  const labels: Record<string, string> = {
    ps1: "PlayStation 1",
    ps2: "PlayStation 2",
    ps3: "PlayStation 3",
    ps4: "PlayStation 4",
    ps5: "PlayStation 5",
    psvita: "PS Vita",
    psp: "PSP",
    n64: "Nintendo 64",
    gamecube: "Nintendo GameCube",
    gameboy: "Nintendo Game Boy",
    gba: "Game Boy Advance",
    switch: "Nintendo Switch",
    switch2: "Nintendo Switch 2",
    megadrive: "Sega Mega Drive",
    mastersystem: "Sega Master System",
    saturn: "Sega Saturn",
    dreamcast: "Sega Dreamcast",
    xbox: "Xbox",
    xbox360: "Xbox 360",
    xboxone: "Xbox One",
    xboxseries: "Xbox Series",
  };
  return labels[slug] ?? slug;
}

function keywordQuery(game: CatalogGame, details: GameDetails | null): string {
  return [game.title, platformQueryLabel(game.platformSlug), game.region, details?.reference]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function catalogSearch(basis: EbaySearchBasis): Promise<EbayCatalogProductSummary[]> {
  const url = new URL(`${ebayCatalogApiBase()}/product_summary/search`);
  if (basis.kind === "gtin") url.searchParams.set("gtin", basis.value);
  else url.searchParams.set("q", basis.value);
  url.searchParams.set("limit", "10");
  const response = await ebayFetch<EbayCatalogSearchResponse>(url.toString(), requestOptions());
  return response.productSummaries ?? [];
}

async function browseSearch(basis: EbaySearchBasis, context: { gameId: string; platformSlug: string }): Promise<EbayItemSummary[]> {
  const url = new URL(`${ebayBrowseApiBase()}/item_summary/search`);
  if (basis.kind === "gtin") url.searchParams.set("gtin", basis.value);
  if (basis.kind === "epid") url.searchParams.set("epid", basis.value);
  if (basis.kind === "keyword") url.searchParams.set("q", basis.value);
  url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE}");
  url.searchParams.set("limit", "20");
  const response = await ebayFetch<EbaySearchResponse>(url.toString(), requestOptions(), {
    gameId: context.gameId,
    platformSlug: context.platformSlug,
  });
  return response.itemSummaries ?? [];
}

function errorWarning(prefix: string, error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "request_failed";
  const status =
    error && typeof error === "object" && "details" in error && error.details && typeof error.details === "object" && "status" in error.details
      ? ` (${String(error.details.status)})`
      : "";
  return `${prefix}: ${code}${status}`;
}

function catalogCandidate(
  candidate: CatalogCandidateWithBasis,
  target: EbayResearchTarget,
): EbayCatalogCandidate {
  const product = candidate.product;
  const match = evaluateEbayResearchMatch(target, {
    title: product.title ?? "",
    productTitle: product.title,
    gtin: product.gtin?.find((gtin) => target.gtins.includes(gtin)) ?? product.gtin?.[0] ?? null,
    epid: product.epid,
    localizedAspects: product.aspects,
    searchBasis: candidate.basis,
  });
  return {
    epid: product.epid?.trim() || null,
    title: product.title?.trim() || "Producto eBay sin título",
    url: safeHttpUrl(product.productWebUrl),
    imageUrls: uniqueImageUrls(product),
    gtins: product.gtin ?? [],
    mpns: product.mpn ?? [],
    brand: product.brand?.trim() || null,
    exactIdentifier: match.exactIdentifier,
    decision: match.decision,
    confidence: match.confidence,
    reasons: match.reasons,
  };
}

function listingFromItem(
  item: EbayItem,
  bases: EbaySearchBasis[],
  target: EbayResearchTarget,
): EbayResearchListing | null {
  const itemId = item.itemId?.trim();
  const title = item.title?.trim();
  if (!itemId || !title || bases.length === 0) return null;
  const strongestBasis = [...bases].sort((a, b) => {
    const weight = { gtin: 3, epid: 2, keyword: 1 };
    return weight[b.kind] - weight[a.kind];
  })[0];
  const match = evaluateEbayResearchMatch(target, {
    title,
    productTitle: title,
    gtin: item.gtin,
    epid: item.epid ?? item.inferredEpid,
    condition: item.condition,
    conditionId: item.conditionId,
    localizedAspects: item.localizedAspects,
    searchBasis: strongestBasis,
  });
  const money = totalPrice(item);
  return {
    itemId,
    title,
    url: safeHttpUrl(item.itemWebUrl),
    affiliateUrl: safeHttpUrl(item.itemAffiliateWebUrl),
    imageUrls: uniqueImageUrls(item),
    price: money.price,
    shippingPrice: money.shipping,
    totalPrice: money.total,
    currency: item.price?.currency?.trim() || null,
    condition: item.condition?.trim() || null,
    conditionBucket: match.conditionBucket,
    decision: match.decision,
    confidence: match.confidence,
    platformMatch: match.platformMatch,
    regionMatch: match.regionMatch,
    suggestedRegion: match.suggestedRegion,
    exactIdentifier: match.exactIdentifier,
    exactReference: match.exactReference,
    epid: item.epid?.trim() || item.inferredEpid?.trim() || null,
    gtin: item.gtin?.trim() || null,
    reasons: match.reasons,
    searchBasis: bases,
  };
}

function decisionRank(decision: EbayResearchDecision): number {
  return { accept: 4, review: 3, other_variant: 2, reject: 1 }[decision];
}

export async function researchEbayMarket(
  game: CatalogGame,
  details: GameDetails | null,
): Promise<EbayResearchReport> {
  const warnings: string[] = [];
  const baseTarget = researchTarget(game, details);
  const catalogWithBasis: CatalogCandidateWithBasis[] = [];

  const exactCatalogBases: EbaySearchBasis[] = baseTarget.gtins
    .slice(0, MAX_GTIN_STRATEGIES)
    .map((value) => ({ kind: "gtin", value }));
  const keywordBasis: EbaySearchBasis = { kind: "keyword", value: keywordQuery(game, details) };
  if (process.env.EBAY_CATALOG_API_ENABLED === "true") {
    const catalogResults = await Promise.all(
      [...exactCatalogBases, keywordBasis].map(async (basis) => {
        try {
          return { basis, products: await catalogSearch(basis), error: null as unknown };
        } catch (error) {
          return { basis, products: [] as EbayCatalogProductSummary[], error };
        }
      }),
    );
    for (const result of catalogResults) {
      result.products.forEach((product) => catalogWithBasis.push({ product, basis: result.basis }));
      if (result.error) {
        const label = result.basis.kind === "gtin" ? `Catálogo eBay por GTIN ${result.basis.value}` : "Catálogo eBay por texto";
        warnings.push(errorWarning(label, result.error));
      }
    }
  } else {
    warnings.push("Catalog API de eBay no habilitada; se usan Browse API, EAN y referencia.");
  }

  const exactEpids = [...new Set(
    catalogWithBasis
      .filter((candidate) => candidate.basis.kind === "gtin")
      .filter((candidate) => candidate.product.gtin?.some((gtin) => baseTarget.gtins.includes(gtin)))
      .map((candidate) => candidate.product.epid?.trim())
      .filter((epid): epid is string => Boolean(epid)),
  )].slice(0, MAX_EPID_STRATEGIES);
  const target = researchTarget(game, details, exactEpids);

  const catalogCandidates = catalogWithBasis
    .map((candidate) => catalogCandidate(candidate, target))
    .filter((candidate, index, all) => {
      const key = candidate.epid || `${candidate.title}:${candidate.imageUrls[0] ?? ""}`;
      return all.findIndex((other) => (other.epid || `${other.title}:${other.imageUrls[0] ?? ""}`) === key) === index;
    })
    .sort((a, b) => decisionRank(b.decision) - decisionRank(a.decision) || b.confidence - a.confidence)
    .slice(0, 12);

  const browseBases: EbaySearchBasis[] = [
    ...target.gtins.slice(0, MAX_GTIN_STRATEGIES).map((value): EbaySearchBasis => ({ kind: "gtin", value })),
    ...exactEpids.map((value): EbaySearchBasis => ({ kind: "epid", value })),
    keywordBasis,
  ];
  const candidates = new Map<string, BrowseCandidate>();
  const browseResults = await Promise.all(
    browseBases.map(async (basis) => {
      try {
        return { basis, items: await browseSearch(basis, { gameId: game.id, platformSlug: game.platformSlug }), error: null as unknown };
      } catch (error) {
        return { basis, items: [] as EbayItemSummary[], error };
      }
    }),
  );
  for (const result of browseResults) {
    const { basis } = result;
    if (result.error) warnings.push(errorWarning(`Ofertas eBay por ${basis.kind}`, result.error));
    for (const summary of result.items) {
        const itemId = summary.itemId?.trim();
        if (!itemId) continue;
        const existing = candidates.get(itemId);
        if (existing) {
          if (!existing.bases.some((entry) => entry.kind === basis.kind && entry.value === basis.value)) {
            existing.bases.push(basis);
          }
        } else {
          candidates.set(itemId, { summary, bases: [basis] });
        }
    }
  }

  const rankedCandidates = [...candidates.values()]
    .map((candidate) => ({
      candidate,
      preview: listingFromItem(candidate.summary, candidate.bases, target),
    }))
    .sort((a, b) => {
      if (!a.preview) return 1;
      if (!b.preview) return -1;
      return decisionRank(b.preview.decision) - decisionRank(a.preview.decision) || b.preview.confidence - a.preview.confidence;
    })
    .slice(0, MAX_LISTING_DETAILS);

  const detailed = await Promise.all(
    rankedCandidates.map(async ({ candidate }) => {
      const itemId = candidate.summary.itemId?.trim();
      if (!itemId) return { item: candidate.summary, bases: candidate.bases };
      try {
        const item = await ebayFetch<EbayItem>(
          `${ebayBrowseApiBase()}/item/${encodeURIComponent(itemId)}`,
          requestOptions(),
          { gameId: game.id, platformSlug: game.platformSlug },
        );
        return { item: { ...candidate.summary, ...item }, bases: candidate.bases };
      } catch (error) {
        warnings.push(errorWarning(`Detalle eBay ${itemId}`, error));
        return { item: candidate.summary, bases: candidate.bases };
      }
    }),
  );

  const listings = detailed
    .map(({ item, bases }) => listingFromItem(item, bases, target))
    .filter((listing): listing is EbayResearchListing => Boolean(listing))
    .sort((a, b) => decisionRank(b.decision) - decisionRank(a.decision) || b.confidence - a.confidence);
  const counts: Record<EbayResearchDecision, number> = { accept: 0, review: 0, other_variant: 0, reject: 0 };
  listings.forEach((listing) => { counts[listing.decision] += 1; });
  const epidEvidence = new Map<string, { observations: number; confidence: number }>();
  for (const listing of listings) {
    if (listing.decision !== "accept" || !listing.exactIdentifier || !listing.epid) continue;
    const current = epidEvidence.get(listing.epid) ?? { observations: 0, confidence: 0 };
    current.observations += 1;
    current.confidence = Math.max(current.confidence, listing.confidence);
    epidEvidence.set(listing.epid, current);
  }

  return {
    generatedAt: new Date().toISOString(),
    target: {
      catalogId: game.id,
      title: game.title,
      platformSlug: game.platformSlug,
      region: game.region,
      gtins: target.gtins,
      reference: target.reference ?? null,
      exactEpids,
    },
    catalogCandidates,
    listings,
    estimates: aggregateEbayListings(listings),
    counts,
    identifierCandidates: {
      epids: [...epidEvidence.entries()]
        .map(([value, evidence]) => ({ value, ...evidence }))
        .sort((a, b) => b.observations - a.observations || b.confidence - a.confidence),
    },
    warnings: [...new Set(warnings)],
  };
}

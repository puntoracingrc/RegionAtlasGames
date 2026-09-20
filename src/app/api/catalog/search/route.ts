import { NextResponse } from "next/server";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_PRICE_TYPE,
  DEFAULT_SORT,
  filterCatalogGames,
  normalizeCatalogPriceTypeForPlatform,
  type CatalogCompanyFilterOption,
  type CatalogPriceFilter,
  type CatalogPriceType,
  type CatalogSort,
  type CatalogTaxonomyFilterOption,
} from "@/lib/catalog-filters";
import { getCatalogBrowseData } from "@/lib/catalog-browse-index";
import { normalizeCatalogSearchText } from "@/lib/catalog-search-normalize";
import { catalogGamePath } from "@/lib/catalog-path";
import { getCoverSrc } from "@/lib/cover-url";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { toRegionalCatalogCardGames, withRegionalCatalogPriceSource } from "@/lib/catalog-card-enrichment";
import { parsePendingEdition } from "@/lib/catalog-review-policy";
import { parseCatalogBroadRegion, parseCatalogPhysicalEditionType } from "@/lib/catalog-edition-guide-types";
import type { CatalogListGame } from "@/lib/types";

const MAX_RESULTS = 12;
const MAX_TAXONOMY_OPTIONS = 16;
const MAX_COMPANY_OPTIONS = 8;
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
};

type SearchResult = {
  id: string;
  title: string;
  href: string;
  platform: string;
  platformSlug: string;
  region: string;
  year: number | null;
  price: number | null;
  coverUrl: string | null;
};

export async function GET(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const includePending = url.searchParams.get("includePending") === "1";
  const pendingEdition = parsePendingEdition(url.searchParams.get("pendingEdition"));
  const platform = url.searchParams.get("platform") ?? "all";
  const region = url.searchParams.get("region") ?? "all";
  const sort = (url.searchParams.get("sort") ?? DEFAULT_SORT) as CatalogSort;
  const priceType = normalizeCatalogPriceTypeForPlatform(
    (url.searchParams.get("priceType") ?? DEFAULT_CATALOG_PRICE_TYPE) as CatalogPriceType,
    platform,
  );
  const priceFilter = (url.searchParams.get("priceFilter") ?? "all") as CatalogPriceFilter;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const mode = url.searchParams.get("mode") ?? "quick";
  const genre = url.searchParams.get("genre") ?? "all";
  const subgenre = url.searchParams.get("subgenre") ?? "all";
  const facet = url.searchParams.get("facet") ?? "all";
  const company = url.searchParams.get("company") ?? "";
  const broadRegion = parseCatalogBroadRegion(url.searchParams.get("broadRegion"));
  const ratingSystem = url.searchParams.get("ratingSystem") ?? "all";
  const physicalEditionType = parseCatalogPhysicalEditionType(url.searchParams.get("physicalEditionType"));
  const browse = await getCatalogBrowseData();
  const headers = {
    ...PUBLIC_CACHE_HEADERS,
    "Server-Timing": `catalog-index;dur=${(performance.now() - startedAt).toFixed(1)}`,
    "X-Region-Atlas-Catalog-Source": browse.source,
  };

  if (mode === "taxonomy-options") {
    return NextResponse.json({
      items: taxonomyOptions(
        url.searchParams.get("type"),
        q,
        browse.filterOptions.subgenres,
        browse.filterOptions.facets,
      ),
    }, { headers });
  }

  if (mode === "company-options") {
    return NextResponse.json({
      items: companyOptions(q, browse.filterOptions.companies),
    }, { headers });
  }

  const hasTaxonomyFilter = genre !== "all" || subgenre !== "all" || facet !== "all";
  if (q.trim().length < 2 && platform === "all" && region === "all" && !hasTaxonomyFilter && mode !== "browser") {
    return NextResponse.json({ items: [], total: 0 }, { headers });
  }

  const filtered = filterCatalogGames(
    browse.games,
    {
      q,
      platform,
      region,
      sort,
      priceType,
      priceFilter,
      includePending,
      pendingEdition,
      genre,
      subgenre,
      facet,
      company,
      broadRegion,
      ratingSystem,
      physicalEditionType,
    },
    {
      platforms: true,
      regions: true,
      mapRegionalPriceSource: (game) => withRegionalCatalogPriceSource(game, region, false),
    },
  );

  if (mode === "browser") {
    const start = (page - 1) * CATALOG_PAGE_SIZE;
    return NextResponse.json({
      items: toRegionalCatalogCardGames(filtered.items.slice(start, start + CATALOG_PAGE_SIZE), region),
      total: filtered.total,
      reviewCounts: filtered.reviewCounts,
    }, { headers });
  }

  const ranked = q.trim()
    ? [...filtered.items].sort((a, b) => relevanceScore(b, q) - relevanceScore(a, q) || a.title.localeCompare(b.title, "es"))
    : filtered.items;
  const items: SearchResult[] = ranked.slice(0, MAX_RESULTS).map((game) => ({
    id: game.id,
    title: decodeHtmlEntities(game.title),
    href: catalogGamePath(game),
    platform: game.displayPlatform,
    platformSlug: game.platformSlug,
    region: game.region,
    year: game.displayYear,
    price: game.recommendedPrice,
    coverUrl: getCoverSrc(game.coverUrl, game.id),
  }));
  return NextResponse.json({ items, total: filtered.total }, { headers });
}

function taxonomyOptions(
  type: string | null,
  rawQuery: string,
  subgenres: CatalogTaxonomyFilterOption[],
  facets: CatalogTaxonomyFilterOption[],
): CatalogTaxonomyFilterOption[] {
  if (type !== "subgenre" && type !== "facet") return [];
  const query = normalizeCatalogSearchText(rawQuery);
  const options = type === "subgenre" ? subgenres : facets;
  return options.filter((option) => !query ||
    normalizeCatalogSearchText(option.name).includes(query) ||
    normalizeCatalogSearchText(option.slug).includes(query))
    .slice(0, MAX_TAXONOMY_OPTIONS);
}

function companyOptions(
  rawQuery: string,
  companies: CatalogCompanyFilterOption[],
): CatalogCompanyFilterOption[] {
  const query = normalizeSearchValue(rawQuery);
  return companies.filter((company) => !query ||
    normalizeSearchValue(company.name).includes(query) ||
    normalizeSearchValue(company.value).includes(query))
    .slice(0, MAX_COMPANY_OPTIONS);
}

function normalizeSearchValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function relevanceScore(game: CatalogListGame, rawQuery: string): number {
  const query = normalizeSearchValue(rawQuery);
  const title = normalizeSearchValue(game.title);
  const slug = normalizeSearchValue(game.slug);
  const id = normalizeSearchValue(game.id);
  const tokens = query.split(/\s+/).filter(Boolean);
  let score = 0;
  if (title === query) score += 10000;
  if (title.startsWith(query)) score += 9000;
  if (title.includes(` ${query}`)) score += 8000;
  if (title.includes(query)) score += 7000;
  if (tokens.length && tokens.every((token) => title.includes(token))) score += 3000;
  if (slug.includes(query)) score += 1500;
  if (id.includes(query)) score += 1000;
  if (game.platformSlug === query) score += 300;
  if (game.recommendedPrice != null) score += 50;
  return score;
}

import { CatalogBrowser } from "@/components/catalog-browser";
import { SiteNav } from "@/components/site-nav";
import { formatCatalogEntryCount } from "@/lib/catalog-entry-count";
import {
  filterCatalogGames,
  DEFAULT_CATALOG_PRICE_TYPE,
  normalizeCatalogPriceTypeForPlatform,
  type CatalogPriceType,
} from "@/lib/catalog-filters";
import { getCatalogBrowseData } from "@/lib/catalog-browse-index";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import { getActiveListingCountsByCatalog } from "@/lib/listings";
import { getCurrentUser } from "@/lib/users";
import { parsePendingEdition } from "@/lib/catalog-review-policy";

const INITIAL_RESULT_COUNT = 12;

type Props = {
  searchParams?: Promise<{
    q?: string;
    platform?: string;
    region?: string;
    genre?: string;
    subgenre?: string;
    facet?: string;
    priceType?: string;
    includePending?: string;
    pendingEdition?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const initialQuery = typeof params?.q === "string" ? params.q : "";
  const initialIncludePending = params?.includePending === "1";
  const initialPendingEdition = parsePendingEdition(params?.pendingEdition);
  const initialPlatform = typeof params?.platform === "string" ? params.platform : "all";
  const initialRegion = typeof params?.region === "string" ? params.region : "all";
  const initialGenre = typeof params?.genre === "string" ? params.genre : "all";
  const initialSubgenre = typeof params?.subgenre === "string" ? params.subgenre : "all";
  const initialFacet = typeof params?.facet === "string" ? params.facet : "all";
  const initialPriceType = normalizeCatalogPriceTypeForPlatform(
    parsePriceType(params?.priceType),
    initialPlatform,
  );
  const initialSort = initialPriceType === DEFAULT_CATALOG_PRICE_TYPE ? "title-asc" : "price-desc";
  const [user, listingCounts, browse] = await Promise.all([
    getCurrentUser(),
    getActiveListingCountsByCatalog(),
    getCatalogBrowseData(),
  ]);
  const ownedCatalogIds = user
    ? await import("@/lib/collection-store").then((store) => store.getOwnedCatalogIds(user.id))
    : [];
  const initialResult = filterCatalogGames(browse.games, {
    q: initialQuery,
    platform: initialPlatform,
    region: initialRegion,
    sort: initialSort,
    priceType: initialPriceType,
    priceFilter: "all",
    includePending: initialIncludePending,
    pendingEdition: initialPendingEdition,
    genre: initialGenre,
    subgenre: initialSubgenre,
    facet: initialFacet,
  }, { platforms: true, regions: true });
  const options = browse.filterOptions;
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
            Catálogo completo
          </p>
          <h1 className="text-3xl font-bold text-foreground">Buscar en todo Region Atlas</h1>
          <p className="max-w-3xl text-muted">
            Explora {formatCatalogEntryCount(browse.catalogCount)} por título, compañía,
            género, saga, referencia, plataforma o región.
          </p>
        </header>

        <CatalogBrowser
          games={initialResult.items.slice(0, INITIAL_RESULT_COUNT).map(toCatalogCardGame)}
          contextName="todo el catálogo"
          source={{ kind: "catalog" }}
          totalCatalogEntryCount={initialResult.total}
          reviewCounts={initialResult.reviewCounts}
          deferInitialLoad
          initialIncludePending={initialIncludePending}
          initialPendingEdition={initialPendingEdition}
          regions={options.regions}
          regionsByPlatform={options.regionsByPlatform}
          platforms={options.platforms}
          genres={options.genres}
          subgenres={options.subgenres}
          facets={options.facets}
          companies={[]}
          physicalEditionFilters={options.physicalEditions}
          showRegionFilter
          showPlatformFilter
          showTaxonomyFilters
          ownedCatalogIds={ownedCatalogIds}
          listingCounts={listingCounts}
          isLoggedIn={!!user}
          initialQuery={initialQuery}
          initialRegion={initialRegion}
          initialPlatform={initialPlatform}
          initialGenre={initialGenre}
          initialSubgenre={initialSubgenre}
          initialFacet={initialFacet}
          initialPriceType={initialPriceType}
        />
      </main>
    </>
  );
}

function parsePriceType(value: string | undefined): CatalogPriceType {
  if (
    value === "sealed" ||
    value === "complete" ||
    value === "loose"
  ) return value;
  return DEFAULT_CATALOG_PRICE_TYPE;
}

import { CatalogBrowser } from "@/components/catalog-browser";
import { SiteNav } from "@/components/site-nav";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_CATALOG_PRICE_TYPE,
  DEFAULT_SORT,
  filterCatalogGames,
  normalizeCatalogPriceTypeForPlatform,
  publicFacetFilterOptions,
  publicGenreFilterOptions,
  publicSubgenreFilterOptions,
  type CatalogPriceType,
} from "@/lib/catalog-filters";
import { publicListedCatalog } from "@/lib/catalog";
import { getActiveListingCountsByCatalog } from "@/lib/listings";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import { getDefaultCatalogInitialPage } from "@/lib/public-catalog-initial-page";
import {
  publicCatalogRegionFilterOptions,
  publicCatalogRegionFilterOptionsByPlatform,
  publicCompanyFilterOptions,
  publicPlatformFilterOptions,
} from "@/lib/public-catalog-filter-options";
import { getCurrentUser } from "@/lib/users";

type Props = {
  searchParams?: Promise<{
    q?: string;
    platform?: string;
    region?: string;
    genre?: string;
    subgenre?: string;
    facet?: string;
    priceType?: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const initialQuery = typeof params?.q === "string" ? params.q : "";
  const initialPlatform = typeof params?.platform === "string" ? params.platform : "all";
  const initialRegion = typeof params?.region === "string" ? params.region : "all";
  const initialGenre = typeof params?.genre === "string" ? params.genre : "all";
  const initialSubgenre = typeof params?.subgenre === "string" ? params.subgenre : "all";
  const initialFacet = typeof params?.facet === "string" ? params.facet : "all";
  const initialPriceType = normalizeCatalogPriceTypeForPlatform(
    parsePriceType(params?.priceType),
    initialPlatform,
  );
  const initialSort = initialPriceType === DEFAULT_CATALOG_PRICE_TYPE ? DEFAULT_SORT : "price-desc";

  const [user, listingCounts] = await Promise.all([
    getCurrentUser(),
    getActiveListingCountsByCatalog(),
  ]);
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];
  const hasInitialFilters =
    initialQuery.trim() !== "" ||
    initialPlatform !== "all" ||
    initialRegion !== "all" ||
    initialGenre !== "all" ||
    initialSubgenre !== "all" ||
    initialFacet !== "all" ||
    initialPriceType !== DEFAULT_CATALOG_PRICE_TYPE;
  const initialCatalog = hasInitialFilters
    ? filterCatalogGames(
        publicListedCatalog.map(toCatalogListGame),
        {
          q: initialQuery,
          platform: initialPlatform,
          region: initialRegion,
          sort: initialSort,
          priceType: initialPriceType,
          priceFilter: "all",
          genre: initialGenre,
          subgenre: initialSubgenre,
          facet: initialFacet,
        },
        { regions: true, platforms: true },
      )
    : getDefaultCatalogInitialPage();
  const initialGames = hasInitialFilters
    ? initialCatalog.items.slice(0, CATALOG_PAGE_SIZE).map(toCatalogCardGame)
    : initialCatalog.items;

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
            Explora {publicListedCatalog.length.toLocaleString("es-ES")} juegos por título, compañía,
            género, saga, referencia, plataforma o región.
          </p>
        </header>

        <CatalogBrowser
          games={initialGames}
          contextName="todo el catálogo"
          source={{ kind: "catalog" }}
          totalCount={initialCatalog.total}
          regions={publicCatalogRegionFilterOptions()}
          regionsByPlatform={publicCatalogRegionFilterOptionsByPlatform()}
          platforms={publicPlatformFilterOptions()}
          genres={publicGenreFilterOptions()}
          subgenres={publicSubgenreFilterOptions()}
          facets={publicFacetFilterOptions()}
          companies={publicCompanyFilterOptions()}
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

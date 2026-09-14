import { CatalogBrowser } from "@/components/catalog-browser";
import { SiteNav } from "@/components/site-nav";
import { formatCatalogEntryCount } from "@/lib/catalog-entry-count";
import {
  DEFAULT_CATALOG_PRICE_TYPE,
  normalizeCatalogPriceTypeForPlatform,
  publicFacetFilterOptions,
  publicGenreFilterOptions,
  publicSubgenreFilterOptions,
  type CatalogPriceType,
} from "@/lib/catalog-filters";
import { getPublicCatalogWithOverlay } from "@/lib/catalog-runtime-overlay";
import { getActiveListingCountsByCatalog } from "@/lib/listings";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import {
  publicCatalogRegionFilterOptions,
  publicCatalogRegionFilterOptionsByPlatform,
  publicCompanyFilterOptions,
  publicPlatformFilterOptions,
} from "@/lib/public-catalog-filter-options";
import { getCurrentUser } from "@/lib/users";
import { isDefaultCatalogGame, parsePendingEdition } from "@/lib/catalog-review-policy";
import { catalogPhysicalFilterOptions } from "@/lib/catalog-physical-edition-browse";

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
  const [user, listingCounts, runtimeCatalog] = await Promise.all([
    getCurrentUser(),
    getActiveListingCountsByCatalog(),
    getPublicCatalogWithOverlay(),
  ]);
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];
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
            Explora {formatCatalogEntryCount(runtimeCatalog.filter(isDefaultCatalogGame).length)} por título, compañía,
            género, saga, referencia, plataforma o región.
          </p>
        </header>

        <CatalogBrowser
          games={[]}
          contextName="todo el catálogo"
          source={{ kind: "catalog" }}
          deferInitialLoad
          initialIncludePending={initialIncludePending}
          initialPendingEdition={initialPendingEdition}
          regions={publicCatalogRegionFilterOptions()}
          regionsByPlatform={publicCatalogRegionFilterOptionsByPlatform()}
          platforms={publicPlatformFilterOptions()}
          genres={publicGenreFilterOptions()}
          subgenres={publicSubgenreFilterOptions()}
          facets={publicFacetFilterOptions()}
          companies={publicCompanyFilterOptions()}
          physicalEditionFilters={catalogPhysicalFilterOptions()}
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

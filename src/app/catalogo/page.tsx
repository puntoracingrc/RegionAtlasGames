import { CatalogBrowser } from "@/components/catalog-browser";
import { SiteNav } from "@/components/site-nav";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  filterCatalogGames,
  platformOptions,
  regionOptions,
} from "@/lib/catalog-filters";
import { listedCatalog, meta } from "@/lib/catalog";
import { getActiveListingCountsByCatalog } from "@/lib/listings";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { getCurrentUser } from "@/lib/users";

type Props = {
  searchParams?: Promise<{ q?: string; platform?: string; region?: string }>;
};

export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: Props) {
  const params = await searchParams;
  const initialQuery = typeof params?.q === "string" ? params.q : "";
  const initialPlatform = typeof params?.platform === "string" ? params.platform : "all";
  const initialRegion = typeof params?.region === "string" ? params.region : "all";

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];
  const listingCounts = await getActiveListingCountsByCatalog();
  const catalogListGames = listedCatalog.map(toCatalogListGame);
  const initialCatalog = filterCatalogGames(
    catalogListGames,
    {
      q: initialQuery,
      platform: initialPlatform,
      region: initialRegion,
      sort: DEFAULT_SORT,
      priceFilter: "all",
    },
    { regions: true, platforms: true },
  );

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
            Explora {meta.catalogListed.toLocaleString("es-ES")} juegos por título, compañía,
            género, saga, referencia, plataforma o región.
          </p>
        </header>

        <CatalogBrowser
          games={initialCatalog.items.slice(0, CATALOG_PAGE_SIZE)}
          contextName="todo el catálogo"
          source={{ kind: "catalog" }}
          totalCount={initialCatalog.total}
          regions={regionOptions(catalogListGames)}
          platforms={platformOptions(catalogListGames)}
          showRegionFilter
          showPlatformFilter
          ownedCatalogIds={ownedCatalogIds}
          listingCounts={listingCounts}
          isLoggedIn={!!user}
          initialQuery={initialQuery}
          initialRegion={initialRegion}
          initialPlatform={initialPlatform}
        />
      </main>
    </>
  );
}

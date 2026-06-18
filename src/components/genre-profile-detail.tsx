import { CatalogBrowser } from "@/components/catalog-browser";
import { GenrePlatformGames, GenreProfileHeader, GenreReferenceTop } from "@/components/genre-profile-sections";
import { SiteNav } from "@/components/site-nav";
import {
  CATALOG_PAGE_SIZE,
  DEFAULT_SORT,
  countByPriceFilter,
  filterCatalogGames,
  platformOptions,
  regionOptions,
} from "@/lib/catalog-filters";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { buildGenreIntro } from "@/lib/genre-seo";
import type { GenreProfileView } from "@/lib/genre-profile";

type Props = {
  view: GenreProfileView;
  ownedCatalogIds: string[];
  isLoggedIn: boolean;
};

export function GenreProfileDetail({ view, ownedCatalogIds, isLoggedIn }: Props) {
  const allGames = view.games.map(toCatalogListGame);
  const initialResult = filterCatalogGames(
    allGames,
    { q: "", region: "all", platform: "all", sort: DEFAULT_SORT, priceFilter: "all" },
    { regions: true, platforms: true },
  );
  const initialGames = initialResult.items.slice(0, CATALOG_PAGE_SIZE);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <GenreProfileHeader view={view} />

        <section className="mb-10 rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">Sobre {view.name}</h2>
          <p className="mt-3 text-sm leading-relaxed text-foreground/85">{buildGenreIntro(view)}</p>
        </section>

        <GenreReferenceTop view={view} />

        <div className="mb-10">
          <GenrePlatformGames view={view} />
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Catálogo completo</h2>
            <p className="mt-1 text-sm text-foreground/75">
              Explora y filtra todos los juegos del género {view.name}.
            </p>
          </div>
          <CatalogBrowser
            games={initialGames}
            contextName={view.name}
            source={{ kind: "genre", slug: view.slug }}
            totalCount={initialResult.total}
            regions={regionOptions(allGames)}
            platforms={platformOptions(allGames)}
            priceCounts={countByPriceFilter(allGames)}
            showRegionFilter
            showPlatformFilter
            ownedCatalogIds={ownedCatalogIds}
            isLoggedIn={isLoggedIn}
          />
        </section>
      </main>
    </>
  );
}

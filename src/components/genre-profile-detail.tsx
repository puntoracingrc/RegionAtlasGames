import { CatalogBrowser } from "@/components/catalog-browser";
import { CatalogGameCard } from "@/components/game-card";
import { GenrePlatformGames, GenreProfileHeader, GenreReferenceTop } from "@/components/genre-profile-sections";
import { SiteNav } from "@/components/site-nav";
import {
  CATALOG_PAGE_SIZE,
  publicRegionFilterOptions,
} from "@/lib/catalog-filters";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { buildGenreIntro } from "@/lib/genre-seo";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { pickRecommendedGames } from "@/lib/game-facet-profile";
import { publicPlatformFilterOptions } from "@/lib/public-catalog-filter-options";
import type { GenreProfileView } from "@/lib/genre-profile";

type Props = {
  view: GenreProfileView;
  ownedCatalogIds: string[];
  isLoggedIn: boolean;
  fromCatalogId?: string | null;
};

export function GenreProfileDetail({ view, ownedCatalogIds, isLoggedIn, fromCatalogId }: Props) {
  const ownedSet = new Set(ownedCatalogIds);
  const { originGame, recommendedGames } = pickRecommendedGames(view.games, fromCatalogId);
  const recommendedListGames = recommendedGames.map(toCatalogListGame);
  const initialGames = [...view.games]
    .sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }))
    .slice(0, CATALOG_PAGE_SIZE)
    .map(toCatalogListGame);

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

        {recommendedListGames.length > 0 && (
          <section className="mb-10 space-y-4 rounded-2xl border border-accent/20 bg-accent/5 p-5 md:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-accent">
                Recomendados
              </p>
              <h2 className="mt-1 text-xl font-black text-foreground">
                {originGame
                  ? `Juegos de ${view.name} parecidos a ${originGame.title}`
                  : `Juegos destacados de ${view.name}`}
              </h2>
              <p className="mt-1 text-sm text-foreground/75">
                Selección destacada y separada del buscador completo del género.
              </p>
            </div>
            <div className={CATALOG_GRID_CLASS}>
              {recommendedListGames.map((game) => (
                <CatalogGameCard
                  key={game.id}
                  game={game}
                  owned={ownedSet.has(game.id)}
                  isLoggedIn={isLoggedIn}
                />
              ))}
            </div>
          </section>
        )}

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
            totalCount={view.games.length}
            regions={publicRegionFilterOptions()}
            platforms={publicPlatformFilterOptions()}
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

import { CatalogBrowser } from "@/components/catalog-browser";
import { SiteNav } from "@/components/site-nav";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { buildGameFacetProfileView } from "@/lib/game-facet-profile";
import { getCurrentUser } from "@/lib/users";

export async function GameFacetProfileDetail({ slug }: { slug: string }) {
  const view = await buildGameFacetProfileView(slug);
  if (!view) return null;

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];
  const games = view.games.map(toCatalogListGame);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
            {view.entity.type === "genre" ? "Género" : view.entity.type === "subgenre" ? "Subgénero" : "Etiqueta / faceta"}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-5xl">{view.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{view.entity.description}</p>
          <p className="mt-4 text-sm font-semibold text-accent">{view.subtitle}</p>
        </header>

        <CatalogBrowser
          games={games}
          contextName={view.title}
          showRegionFilter
          showPlatformFilter
          ownedCatalogIds={ownedCatalogIds}
          isLoggedIn={!!user}
        />
      </main>
    </>
  );
}

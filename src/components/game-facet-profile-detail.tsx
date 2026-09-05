import { CatalogBrowser } from "@/components/catalog-browser";
import { CatalogGameCard } from "@/components/game-card";
import { IndexEntityJsonLd } from "@/components/index-entity-json-ld";
import { SiteNav } from "@/components/site-nav";
import { CATALOG_PAGE_SIZE } from "@/lib/catalog-filters";
import { CATALOG_GRID_CLASS } from "@/lib/cover-aspect";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { toCatalogCardGame } from "@/lib/catalog-card-game";
import { getOwnedCatalogIds } from "@/lib/collection-store";
import { buildGameFacetProfileView } from "@/lib/game-facet-profile";
import {
  publicCatalogRegionFilterOptions,
  publicCatalogRegionFilterOptionsByPlatform,
  publicPlatformFilterOptions,
} from "@/lib/public-catalog-filter-options";
import { getCurrentUser } from "@/lib/users";

function entityTypeLabel(type: "genre" | "subgenre" | "facet"): string {
  if (type === "genre") return "Género";
  if (type === "subgenre") return "Subgénero";
  return "Etiqueta / faceta";
}

function entityDescription(name: string, description?: string): string {
  return description?.trim() || `Agrupa juegos relacionados con ${name}, para explorar el catálogo por afinidad jugable, temática o de estilo.`;
}

export async function GameFacetProfileDetail({
  slug,
  fromCatalogId,
}: {
  slug: string;
  fromCatalogId?: string | null;
}) {
  const view = await buildGameFacetProfileView(slug, { fromCatalogId });
  if (!view) return null;

  const user = await getCurrentUser();
  const ownedCatalogIds = user ? await getOwnedCatalogIds(user.id) : [];
  const ownedSet = new Set(ownedCatalogIds);
  const games = [...view.games]
    .sort((a, b) => a.title.localeCompare(b.title, "es", { sensitivity: "base" }))
    .slice(0, CATALOG_PAGE_SIZE)
    .map(toCatalogListGame)
    .map(toCatalogCardGame);
  const recommendedGames = view.recommendedGames.map(toCatalogListGame);
  const typeLabel = entityTypeLabel(view.entity.type);
  const indexKind = view.entity.type === "genre" ? "genre" : "tag";
  const indexLabel = indexKind === "genre" ? "Géneros" : "Etiquetas";
  const indexHref = indexKind === "genre" ? "/genero" : "/etiqueta";

  return (
    <>
      <IndexEntityJsonLd
        summary={{
          kind: indexKind,
          name: view.title,
          slug: view.entity.slug,
          catalogEntryCount: view.catalogEntryCount,
        }}
        breadcrumbs={[
          { label: indexLabel, href: indexHref },
          { label: view.title },
        ]}
      />
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
            {typeLabel}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-5xl">{view.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {entityDescription(view.title, view.entity.description)}
          </p>
          <p className="mt-4 text-sm font-semibold text-accent">{view.subtitle}</p>
        </header>

        {recommendedGames.length > 0 && (
          <section className="mb-10 space-y-4 rounded-2xl border border-accent/20 bg-accent/5 p-5 md:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-accent">
                Recomendados
              </p>
              <h2 className="mt-1 text-xl font-black text-foreground">
                {view.originGame
                  ? `Juegos de ${view.title} parecidos a ${view.originGame.title}`
                  : `Juegos destacados de ${view.title}`}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Selección separada del buscador para descubrir afinidades de género, subgénero y facetas.
              </p>
            </div>
            <div className={CATALOG_GRID_CLASS}>
              {recommendedGames.map((game) => (
                <CatalogGameCard
                  key={game.id}
                  game={game}
                  owned={ownedSet.has(game.id)}
                  isLoggedIn={!!user}
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Buscar dentro de {view.title}</h2>
            <p className="mt-1 text-sm text-muted">
              El buscador ya empieza filtrado por este {typeLabel.toLowerCase()} y permite afinar por región, plataforma y texto.
            </p>
          </div>
          <CatalogBrowser
            games={games}
            contextName={view.title}
            source={{ kind: "taxonomy", filter: view.entity.type, slug: view.entity.slug }}
            totalCatalogEntryCount={view.catalogEntryCount}
            regions={publicCatalogRegionFilterOptions()}
            regionsByPlatform={publicCatalogRegionFilterOptionsByPlatform()}
            platforms={publicPlatformFilterOptions()}
            showRegionFilter
            showPlatformFilter
            ownedCatalogIds={ownedCatalogIds}
            isLoggedIn={!!user}
          />
        </section>
      </main>
    </>
  );
}

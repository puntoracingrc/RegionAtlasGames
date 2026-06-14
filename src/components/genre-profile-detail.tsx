import { EntityBrowser } from "@/components/catalog-browser";
import { GenrePlatformGames, GenreProfileHeader } from "@/components/genre-profile-sections";
import { SiteNav } from "@/components/site-nav";
import { buildGenreIntro } from "@/lib/genre-seo";
import type { GenreProfileView } from "@/lib/genre-profile";

type Props = {
  view: GenreProfileView;
  ownedCatalogIds: string[];
  isLoggedIn: boolean;
};

export function GenreProfileDetail({ view, ownedCatalogIds, isLoggedIn }: Props) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <GenreProfileHeader view={view} />

        <section className="mb-10 rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">Sobre {view.name}</h2>
          <p className="mt-3 text-sm leading-relaxed text-foreground/85">{buildGenreIntro(view)}</p>
        </section>

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
          <EntityBrowser
            games={view.games}
            title={view.name}
            ownedCatalogIds={ownedCatalogIds}
            isLoggedIn={isLoggedIn}
          />
        </section>
      </main>
    </>
  );
}

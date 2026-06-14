import { EntityBrowser } from "@/components/catalog-browser";
import { CompanyCollaborators } from "@/components/company-collaborators";
import { CompanyPlatformGames } from "@/components/company-platform-games";
import { CompanyProfileHeader } from "@/components/company-profile-header";
import { SiteNav } from "@/components/site-nav";
import { buildCompanyIntro } from "@/lib/company-seo";
import type { CompanyProfileView } from "@/lib/company-profile";

type Props = {
  view: CompanyProfileView;
  ownedCatalogIds: string[];
  isLoggedIn: boolean;
};

export function CompanyProfileDetail({ view, ownedCatalogIds, isLoggedIn }: Props) {
  const intro = buildCompanyIntro(view);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <CompanyProfileHeader view={view} />

        <section className="mb-10 rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">Sobre {view.name}</h2>
          <p className="mt-3 text-sm leading-relaxed text-foreground/85">{intro}</p>
        </section>

        <div className="mb-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <CompanyPlatformGames platforms={view.platforms} />
          <CompanyCollaborators collaborators={view.collaborators} selfName={view.name} />
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Catálogo completo</h2>
            <p className="mt-1 text-sm text-foreground/75">
              Explora y filtra todos los juegos de {view.name} en Region Atlas.
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

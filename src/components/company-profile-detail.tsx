import Link from "next/link";
import { EntityBrowser } from "@/components/catalog-browser";
import { CompanyCollaborators } from "@/components/company-collaborators";
import { CompanyPlatformGames } from "@/components/company-platform-games";
import { CompanyProfileHeader } from "@/components/company-profile-header";
import { NewsStrip } from "@/components/news-strip";
import { SiteNav } from "@/components/site-nav";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { buildCompanyIntro } from "@/lib/company-seo";
import type { CompanyProfileView } from "@/lib/company-profile";
import type { NewsItem } from "@/lib/types";
import type { PublicSeriesReference } from "@/lib/admin-series-manager";

type Props = {
  view: CompanyProfileView;
  series: PublicSeriesReference[];
  newsItems: NewsItem[];
  ownedCatalogIds: string[];
  isLoggedIn: boolean;
};

export function CompanyProfileDetail({ view, series, newsItems, ownedCatalogIds, isLoggedIn }: Props) {
  const intro = buildCompanyIntro(view);
  const introParagraphs = intro.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const games = view.games.map(toCatalogListGame);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <CompanyProfileHeader view={view} />

        <NewsStrip eyebrow="Industria" title="Actualidad de compañías y desarrolladoras" items={newsItems} />

        <section className="mb-10 rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">Sobre {view.name}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85">
            {introParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        <div className="mb-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <CompanyPlatformGames platforms={view.platforms} />
          <CompanyCollaborators collaborators={view.collaborators} selfName={view.name} />
        </div>

        {series.length > 0 && (
          <section className="mb-10 rounded-2xl border border-border bg-card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Sagas relacionadas</h2>
                <p className="mt-1 text-sm text-foreground/75">
                  Sagas donde aparece al menos un juego de {view.name}.
                </p>
              </div>
              <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                {series.length} {series.length === 1 ? "saga" : "sagas"}
              </span>
            </div>

            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background/45">
              {series.map((item) => (
                <li
                  key={item.slug}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <Link
                    href={`/saga/${item.slug}`}
                    className="font-semibold text-foreground hover:text-accent"
                  >
                    {item.name}
                  </Link>
                  <span className="text-sm text-muted">
                    {item.matchedGameCount} {item.matchedGameCount === 1 ? "juego" : "juegos"} de{" "}
                    {view.name}
                    {item.gameCount > 0 ? ` · ${item.gameCount} en la saga` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Catálogo completo</h2>
            <p className="mt-1 text-sm text-foreground/75">
              Explora y filtra todos los juegos de {view.name} en Region Atlas.
            </p>
          </div>
          <EntityBrowser
            games={games}
            title={view.name}
            ownedCatalogIds={ownedCatalogIds}
            isLoggedIn={isLoggedIn}
          />
        </section>
      </main>
    </>
  );
}

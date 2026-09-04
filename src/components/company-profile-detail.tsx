import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { EntityBrowser } from "@/components/catalog-browser";
import { CompanyCollaborators } from "@/components/company-collaborators";
import { CompanyPlatformGames } from "@/components/company-platform-games";
import { CompanyProfileHeader } from "@/components/company-profile-header";
import { PersonPortrait } from "@/components/person-portrait";
import { SiteNav } from "@/components/site-nav";
import { toCatalogListGame } from "@/lib/catalog-list-game";
import { buildCompanyIntro } from "@/lib/company-seo";
import type { CompanyProfileView } from "@/lib/company-profile";
import type { PublicSeriesReference } from "@/lib/admin-series-manager";

type Props = {
  view: CompanyProfileView;
  series: PublicSeriesReference[];
  ownedCatalogIds: string[];
  isLoggedIn: boolean;
};

export function CompanyProfileDetail({ view, series, ownedCatalogIds, isLoggedIn }: Props) {
  const intro = buildCompanyIntro(view);
  const introParagraphs = intro.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const games = view.games.map(toCatalogListGame);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <CompanyProfileHeader view={view} />

        <section className="mb-10 rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">Sobre {view.name}</h2>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground/85">
            {introParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        {view.achievements.length > 0 && (
          <section className="mb-10 border-y border-border py-5 md:py-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Hitos documentados</h2>
                <p className="mt-1 text-sm text-foreground/75">
                  Hechos contrastados con fuentes corporativas primarias.
                </p>
              </div>
              <span className="text-sm font-semibold text-muted">
                {view.achievements.length} {view.achievements.length === 1 ? "hito" : "hitos"}
              </span>
            </div>
            <ol className="mt-4 divide-y divide-border">
              {view.achievements.map((achievement) => {
                const source = view.researchSources.find(
                  (item) => item.id === achievement.sourceId,
                );
                return (
                  <li key={achievement.id} className="grid gap-2 py-4 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-start">
                    <span className="text-sm font-bold text-accent">
                      {achievement.yearLabel ?? "Trayectoria"}
                    </span>
                    <div>
                      <h3 className="font-semibold text-foreground">{achievement.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-foreground/80">{achievement.summaryEs}</p>
                      {achievement.relatedGamesOrSeries.length > 0 && (
                        <p className="mt-2 text-xs text-muted">
                          {achievement.relatedGamesOrSeries.join(" · ")}
                        </p>
                      )}
                    </div>
                    {source && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                      >
                        Fuente
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {view.researchSources.length > 0 && (
          <section className="mb-10 border-b border-border pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Fuentes de investigación
            </h2>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {view.researchSources.map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                >
                  {source.title}
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
        )}

        {view.people.length > 0 && (
          <section className="mb-10 border-y border-border py-5 md:py-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Personas vinculadas</h2>
                <p className="mt-1 text-sm text-foreground/75">
                  Relaciones profesionales publicadas con fuente y revisión.
                </p>
              </div>
              <span className="text-sm font-semibold text-muted">
                {view.people.length} {view.people.length === 1 ? "persona" : "personas"}
              </span>
            </div>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {view.people.map((person) => (
                <li key={person.slug}>
                  <Link
                    href={`/persona/${person.slug}`}
                    className="grid min-h-20 grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-card p-2.5 transition hover:border-accent/35 hover:bg-card-hover"
                  >
                    <PersonPortrait
                      src={person.portraitPath}
                      name={person.name}
                      sizes="56px"
                      className="h-14 w-14 rounded-md border border-border"
                    />
                    <div className="min-w-0 self-center">
                      <h3 className="truncate text-sm font-semibold text-foreground">{person.name}</h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted">
                        {person.roles.join(" · ")}
                        {person.periods.length > 0 ? ` · ${person.periods.join(" · ")}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

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
            <h2 className="text-xl font-bold text-foreground">Catálogo completo · {view.name}</h2>
            <p className="mt-1 text-sm text-foreground/75">
              Explora y filtra todos los juegos de {view.name} en Region Atlas.
            </p>
          </div>
          <EntityBrowser
            games={games}
            title={view.name}
            ownedCatalogIds={ownedCatalogIds}
            isLoggedIn={isLoggedIn}
            showPriceLegend={false}
          />
        </section>
      </main>
    </>
  );
}

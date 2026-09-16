import type { Metadata } from "next";
import { Suspense } from "react";
import { PersonExplorer } from "@/components/person-explorer";
import { SiteNav } from "@/components/site-nav";
import { getAvailablePersonExpertiseFilters } from "@/lib/person-expertise";
import { getPersonPlatformFilterGroups } from "@/lib/person-platform-filters";
import { getPersonCards } from "@/lib/person-public-research";
import { readAdminPersonPortraitsSafely } from "@/lib/person-portrait-storage";
import { getSiteUrl } from "@/lib/site-url";

const people = getPersonCards();
const platformGroups = getPersonPlatformFilterGroups();
const expertiseOptions = getAvailablePersonExpertiseFilters(people);

export const metadata: Metadata = {
  title: "Personas de la industria del videojuego",
  description: `${people.length} perfiles documentados de diseñadores, programadores, responsables creativos, fundadores y otras figuras de la industria del videojuego.`,
  alternates: { canonical: `${getSiteUrl()}/persona` },
  openGraph: {
    title: "Personas de la industria del videojuego | Region Atlas",
    description: "Trayectorias, compañías, obras, créditos y fuentes de figuras vinculadas a la historia del videojuego.",
    url: `${getSiteUrl()}/persona`,
    type: "website",
  },
};

export default async function PeoplePage() {
  const uploadedPortraits = await readAdminPersonPortraitsSafely();
  const displayPeople = people.map((person) => ({
    ...person,
    portraitPath: uploadedPortraits[person.slug]?.path ?? person.portraitPath,
  }));
  const editorial = displayPeople.filter((person) => person.publicationLevel === "editorial").length;
  const portraits = displayPeople.filter((person) => person.portraitPath).length;
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-7 border-b border-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Industria</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">Personas</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <span><strong className="text-foreground">{displayPeople.length}</strong> perfiles publicados</span>
            <span><strong className="text-foreground">{editorial}</strong> con revisión editorial</span>
            <span><strong className="text-foreground">{portraits}</strong> retratos visibles</span>
          </div>
        </header>
        <Suspense
          fallback={(
            <div className="rounded-lg border border-border bg-card px-4 py-14 text-center text-sm text-muted">
              Cargando filtros de personas…
            </div>
          )}
        >
          <PersonExplorer
            people={displayPeople}
            platformGroups={platformGroups}
            expertiseOptions={expertiseOptions}
          />
        </Suspense>
      </main>
    </>
  );
}

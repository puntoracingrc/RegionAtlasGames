import type { Metadata } from "next";
import { PersonExplorer } from "@/components/person-explorer";
import { SiteNav } from "@/components/site-nav";
import { getPersonCards } from "@/lib/person-public-research";
import { getSiteUrl } from "@/lib/site-url";

const people = getPersonCards();

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

export default function PeoplePage() {
  const editorial = people.filter((person) => person.publicationLevel === "editorial").length;
  const portraits = people.filter((person) => person.portraitPath).length;
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        <header className="mb-7 border-b border-border pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Industria</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">Personas</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <span><strong className="text-foreground">{people.length}</strong> perfiles publicados</span>
            <span><strong className="text-foreground">{editorial}</strong> con revisión editorial</span>
            <span><strong className="text-foreground">{portraits}</strong> retratos acreditados</span>
          </div>
        </header>
        <PersonExplorer people={people} />
      </main>
    </>
  );
}
